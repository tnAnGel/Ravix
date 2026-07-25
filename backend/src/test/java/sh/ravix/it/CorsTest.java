package sh.ravix.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.equalToIgnoringCase;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import sh.ravix.testsupport.PostgresResource;

/**
 * CORS behaviour. The regression these guard against is real: a strict static
 * allow-list once 403'd the panel's own origin, locking the UI out of its API.
 */
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
@org.junit.jupiter.api.condition.EnabledIf(
        value = "sh.ravix.testsupport.Docker#available",
        disabledReason = "Docker not available — skipping Postgres-backed integration test")
class CorsTest {

    /** The panel is served from the same origin as the API — it must never break. */
    @Test
    void sameOriginIsAlwaysAllowed() {
        given().header("Host", "panel.example.com")
                .header("X-Forwarded-Proto", "https")
                .header("Origin", "https://panel.example.com")
                .when().get("/api/auth/status")
                .then().statusCode(200)
                .header("Access-Control-Allow-Origin", is("https://panel.example.com"))
                .header("Access-Control-Allow-Credentials", is("true"));
    }

    /** An unknown site gets no CORS headers, so the browser refuses the response. */
    @Test
    void foreignOriginGetsNoCorsHeaders() {
        given().header("Host", "panel.example.com")
                .header("Origin", "https://evil.example.net")
                .when().get("/api/auth/status")
                .then().statusCode(200)
                .header("Access-Control-Allow-Origin", nullValue());
    }

    /** The Vite dev server is on the configured allow-list. */
    @Test
    void configuredDevOriginIsAllowed() {
        given().header("Origin", "http://localhost:5173")
                .when().get("/api/auth/status")
                .then().statusCode(200)
                .header("Access-Control-Allow-Origin", is("http://localhost:5173"));
    }

    /**
     * Preflight must be answered by CORS rather than bounced by the auth filter —
     * a 401 here would make every cross-origin POST fail before it is sent.
     * Any 2xx satisfies the browser; RESTEasy answers OPTIONS itself with 200,
     * and our response filter attaches the headers that actually matter.
     */
    @Test
    void preflightOnAProtectedPathIsNotBounced() {
        given().header("Host", "panel.example.com")
                .header("X-Forwarded-Proto", "https")
                .header("Origin", "https://panel.example.com")
                .header("Access-Control-Request-Method", "POST")
                .when().options("/api/domains")
                .then().statusCode(anyOf(is(200), is(204)))
                .header("Access-Control-Allow-Origin", is("https://panel.example.com"))
                .header("Access-Control-Allow-Credentials", is("true"))
                .header("Access-Control-Allow-Methods", equalToIgnoringCase(
                        "GET,POST,PUT,PATCH,DELETE,OPTIONS"));
    }

    /** A request with no Origin (curl, a script) is untouched by CORS. */
    @Test
    void nonBrowserRequestIsUnaffected() {
        given().when().get("/api/auth/status")
                .then().statusCode(200)
                .header("Access-Control-Allow-Origin", nullValue());
    }
}
