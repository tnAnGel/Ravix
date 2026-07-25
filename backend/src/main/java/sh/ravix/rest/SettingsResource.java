package sh.ravix.rest;

import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.LinkedHashMap;
import java.util.Map;
import sh.ravix.entity.AppSetting;

@Path("/api/settings")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Transactional
public class SettingsResource {

    @GET
    public Map<String, String> get() {
        Map<String, String> out = new LinkedHashMap<>();
        for (AppSetting s : AppSetting.<AppSetting>listAll()) {
            out.put(s.key, s.value);
        }
        // Inject runtime-derived values the UI wants to display on the
        // Settings → Storage / Advanced panes. These reflect what the
        // process is actually using right now — not seeded defaults that
        // could drift from reality.
        out.putIfAbsent("path_data",
                System.getenv().getOrDefault("RAVIX_PATH_DATA", "/var/lib/ravix"));
        out.putIfAbsent("path_config",
                System.getenv().getOrDefault("RAVIX_PATH_CONFIG", "/etc/ravix"));
        out.putIfAbsent("path_logs", "/var/log/ravix");
        out.putIfAbsent("path_app", "/opt/ravix/quarkus-app/quarkus-run.jar");
        // Show the JDBC URL minus the credentials so the operator can
        // verify which database we're talking to without leaking secrets.
        String jdbc = System.getenv().getOrDefault(
                "RAVIX_DB_URL", "jdbc:postgresql://localhost:5432/ravix");
        out.put("db_url", jdbc);
        return out;
    }

    @PUT
    public Map<String, String> update(Map<String, String> updates) {
        if (updates != null) {
            updates.forEach((k, v) -> {
                AppSetting s = AppSetting.findById(k);
                if (s == null) {
                    s = new AppSetting();
                    s.key = k;
                    s.value = v;
                    s.persist();
                } else {
                    s.value = v;
                }
            });
        }
        return get();
    }
}
