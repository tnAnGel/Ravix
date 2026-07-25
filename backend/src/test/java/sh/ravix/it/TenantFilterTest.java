package sh.ravix.it;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.OffsetDateTime;
import java.util.List;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;
import sh.ravix.entity.Domain;
import sh.ravix.testsupport.PostgresResource;
import sh.ravix.util.Ids;

/**
 * Verifies the multi-tenant {@code orgFilter} actually scopes reads — the
 * mechanism behind the isolation leak we fixed. With the filter enabled for one
 * org, queries must not return another org's rows.
 */
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
@org.junit.jupiter.api.condition.EnabledIf(
        value = "sh.ravix.testsupport.Docker#available",
        disabledReason = "Docker not available — skipping Postgres-backed integration test")
class TenantFilterTest {

    @Inject
    EntityManager em;

    private static void seedDomain(String name, String orgId) {
        Domain d = new Domain();
        d.id = Ids.generate("dom");
        d.orgId = orgId;
        d.name = name;
        d.status = "active";
        d.createdAt = OffsetDateTime.now();
        d.checkMx = d.checkSpf = d.checkDkim = d.checkDmarc = d.checkSsl = "pending";
        d.dkimSelector = "default";
        d.dkimPublicKey = "";
        d.persist();
    }

    @Test
    void orgFilterScopesReadsToOneTenant() {
        QuarkusTransaction.requiringNew().run(() -> {
            Domain.deleteAll();
            seedDomain("alpha.com", "org_a");
            seedDomain("beta.com", "org_b");
            seedDomain("alpha2.com", "org_a");
        });

        // Unfiltered: all three are visible.
        QuarkusTransaction.requiringNew().run(() ->
                assertEquals(3, Domain.count(), "all rows exist unfiltered"));

        // Filtered to org_a: only org_a's two domains are visible.
        QuarkusTransaction.requiringNew().run(() -> {
            em.unwrap(Session.class).enableFilter("orgFilter").setParameter("orgId", "org_a");
            List<Domain> visible = Domain.listAll();
            assertEquals(2, visible.size(), "org_a sees exactly its own domains");
            assertTrue(visible.stream().allMatch(d -> "org_a".equals(d.orgId)),
                    "no cross-tenant row leaked into org_a's view");
        });

        // Filtered to org_b: only the one beta.com domain.
        QuarkusTransaction.requiringNew().run(() -> {
            em.unwrap(Session.class).enableFilter("orgFilter").setParameter("orgId", "org_b");
            List<Domain> visible = Domain.listAll();
            assertEquals(1, visible.size());
            assertEquals("beta.com", visible.get(0).name);
        });
    }
}
