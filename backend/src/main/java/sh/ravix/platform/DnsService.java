package sh.ravix.platform;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;
import org.jboss.logging.Logger;

/** Real DNS lookups via JNDI (no external dependency). */
@ApplicationScoped
public class DnsService {

    private static final Logger LOG = Logger.getLogger(DnsService.class);

    /** Returns the records of a given type for a name, or an empty list on failure. */
    public List<String> lookup(String name, String type) {
        List<String> results = new ArrayList<>();
        try {
            Hashtable<String, String> env = new Hashtable<>();
            env.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
            env.put("com.sun.jndi.dns.timeout.initial", "3000");
            env.put("com.sun.jndi.dns.timeout.retries", "2");
            InitialDirContext ctx = new InitialDirContext(env);
            Attributes attrs = ctx.getAttributes(name, new String[] {type});
            Attribute attr = attrs.get(type);
            if (attr != null) {
                for (int i = 0; i < attr.size(); i++) {
                    Object v = attr.get(i);
                    if (v != null) {
                        // TXT records come back quoted and possibly chunked.
                        results.add(v.toString().replace("\"", "").trim());
                    }
                }
            }
            ctx.close();
        } catch (Exception e) {
            LOG.debugf("DNS %s %s failed: %s", type, name, e.getMessage());
        }
        return results;
    }

    public List<String> txt(String name) {
        return lookup(name, "TXT");
    }

    public List<String> mx(String name) {
        return lookup(name, "MX");
    }

    public List<String> a(String name) {
        return lookup(name, "A");
    }

    public List<String> ptr(String ip) {
        String reversed = reverse(ip);
        if (reversed == null) return List.of();
        return lookup(reversed + ".in-addr.arpa", "PTR");
    }

    private static String reverse(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length != 4) return null;
        return parts[3] + "." + parts[2] + "." + parts[1] + "." + parts[0];
    }
}
