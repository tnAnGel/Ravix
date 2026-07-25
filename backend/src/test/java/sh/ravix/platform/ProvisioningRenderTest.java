package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.mockito.InjectMock;
import jakarta.inject.Inject;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import sh.ravix.entity.Domain;
import sh.ravix.entity.Mailbox;
import sh.ravix.testsupport.PostgresResource;
import sh.ravix.util.Ids;

/**
 * Golden-file tests for the provisioning layer — the riskiest code in the
 * project (it rewrites a live mail server's config). PlatformService is mocked
 * so nothing touches the host: every {@code writeGenerated(path, content)} is
 * captured and the rendered config is asserted. This is exactly where every
 * recent production fire happened, so it gets the most coverage.
 */
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
@org.junit.jupiter.api.condition.EnabledIf(
        value = "sh.ravix.testsupport.Docker#available",
        disabledReason = "Docker not available — skipping Postgres-backed integration test")
class ProvisioningRenderTest {

    @InjectMock
    PlatformService platform;

    @Inject
    ProvisioningService provisioning;

    /** path -> last content written there during the test. */
    private final Map<String, String> written = new HashMap<>();

    @BeforeEach
    void setup() {
        written.clear();
        Mockito.when(platform.isLinux()).thenReturn(true);
        Mockito.when(platform.readFile(Mockito.anyString())).thenReturn(Optional.empty());
        Mockito.when(platform.writeGenerated(Mockito.anyString(), Mockito.anyString()))
                .thenAnswer(inv -> {
                    written.put(inv.getArgument(0), inv.getArgument(1));
                    return true;
                });

        QuarkusTransaction.requiringNew().run(() -> {
            Mailbox.deleteAll();
            Domain.deleteAll();

            Domain d = new Domain();
            d.id = Ids.generate("dom");
            d.orgId = "org_default";
            d.name = "example.com";
            d.status = "active";
            d.createdAt = OffsetDateTime.now();
            d.checkMx = d.checkSpf = d.checkDkim = d.checkDmarc = d.checkSsl = "pending";
            d.dkimSelector = "default";
            d.dkimPublicKey = "";
            d.persist();

            mailbox("withpw@example.com", "$2a$10$abcdefghijklmnopqrstuv").persist();
            mailbox("nopw@example.com", null).persist();   // intentionally no password
        });
    }

    private static Mailbox mailbox(String email, String hash) {
        Mailbox m = new Mailbox();
        m.id = Ids.generate("mb");
        m.orgId = "org_default";
        m.email = email;
        m.displayName = email;
        m.domain = "example.com";
        m.status = "active";
        m.passwordHash = hash;
        m.createdAt = OffsetDateTime.now();
        return m;
    }

    @Test
    void postfixVirtualMapsAcceptEveryActiveMailbox() {
        QuarkusTransaction.requiringNew().run(() -> provisioning.renderPostfix());

        String domains = written.get("/etc/postfix/ravix/virtual_domains");
        String boxes = written.get("/etc/postfix/ravix/virtual_mailboxes");
        assertNotNull(domains, "virtual_domains must be written");
        assertNotNull(boxes, "virtual_mailboxes must be written");

        assertTrue(domains.contains("example.com OK"), domains);
        assertTrue(boxes.contains("withpw@example.com example.com/withpw/"), boxes);
        // Postfix must accept the password-less box too, else it 550s at SMTP.
        assertTrue(boxes.contains("nopw@example.com example.com/nopw/"),
                "password-less box must be a valid Postfix recipient:\n" + boxes);
    }

    @Test
    void dovecotUserdbIncludesPasswordlessBoxWithEmptyPassword() {
        QuarkusTransaction.requiringNew().run(() -> provisioning.renderDovecot());

        String users = written.get("/etc/dovecot/ravix-users");
        assertNotNull(users, "the dovecot passwd-file must be written");

        // Box WITH a password carries its BLF-CRYPT hash (IMAP/POP login works).
        assertTrue(users.contains("withpw@example.com:{BLF-CRYPT}$2a$10$abcdefghijklmnopqrstuv:"),
                "password box should carry its hash:\n" + users);

        // Box WITHOUT a password must STILL be in the userdb (empty password
        // field) so inbound LMTP can deliver — this is the bug we shipped a fix
        // for. Login is denied (no credential), delivery works.
        assertTrue(users.contains(
                        "nopw@example.com::5000:5000::/var/vmail/example.com/nopw::"
                                + "userdb_mail=maildir:/var/vmail/example.com/nopw/Maildir"),
                "password-less box must be in userdb with an EMPTY password:\n" + users);
    }

    @Test
    void dovecotDeliveryConfigWiresMaildirAndLmtp() {
        QuarkusTransaction.requiringNew().run(
                () -> provisioning.renderDovecotDelivery("mail.example.com"));

        String conf = written.get("/etc/dovecot/conf.d/99-ravix.conf");
        assertNotNull(conf, "the dovecot delivery conf must be written");
        assertTrue(conf.contains("mail_location = maildir:~/Maildir"), conf);
        assertTrue(conf.contains("/var/spool/postfix/private/dovecot-lmtp"), conf);
        assertTrue(conf.contains("protocols = imap pop3 lmtp"), conf);
        assertTrue(conf.contains("inbox = yes"), conf);
    }
}
