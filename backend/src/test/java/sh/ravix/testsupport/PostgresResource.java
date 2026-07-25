package sh.ravix.testsupport;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import java.util.Map;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Starts a throwaway PostgreSQL container and points the Quarkus datasource at
 * it. Returned config overrides win over application.properties, so this is
 * deterministic regardless of any local DB. One container is shared across the
 * whole test run (Quarkus starts an identical resource once).
 *
 * Annotate integration tests with
 * {@code @QuarkusTestResource(PostgresResource.class)}.
 */
public class PostgresResource implements QuarkusTestResourceLifecycleManager {

    private static final PostgreSQLContainer<?> PG =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("ravix")
                    .withUsername("ravix")
                    .withPassword("ravix");

    @Override
    public Map<String, String> start() {
        if (!PG.isRunning()) {
            PG.start();
        }
        return Map.of(
                "quarkus.datasource.jdbc.url", PG.getJdbcUrl(),
                "quarkus.datasource.username", PG.getUsername(),
                "quarkus.datasource.password", PG.getPassword());
    }

    @Override
    public void stop() {
        // Leave the container for the JVM/Ryuk to reap — keeps it shared across
        // all test classes in the run without paying repeated startup cost.
    }
}
