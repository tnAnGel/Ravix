package sh.ravix.testsupport;

/**
 * Probe used by {@code @EnabledIf} on integration tests so they SKIP (not fail)
 * when no Docker daemon is reachable — keeps {@code mvn test} green on CI and
 * dev machines without Docker, while still running the real Postgres-backed
 * tests wherever Docker is available.
 */
public final class Docker {

    static {
        // docker-java defaults to API 1.32, which OrbStack (and other modern
        // daemons that enforce a minimum) reject with "client version too old".
        // Pin a modern version any daemon accepts. Harmless on standard Docker.
        if (System.getProperty("api.version") == null) {
            System.setProperty("api.version", "1.43");
        }
    }

    private Docker() {}

    public static boolean available() {
        try {
            return org.testcontainers.DockerClientFactory.instance().isDockerAvailable();
        } catch (Throwable t) {
            return false;
        }
    }
}
