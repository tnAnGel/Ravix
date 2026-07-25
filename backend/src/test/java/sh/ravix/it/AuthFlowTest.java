package sh.ravix.it;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import sh.ravix.testsupport.PostgresResource;

/** REST-level auth flow against a real DB (admin seeded at startup). */
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
@org.junit.jupiter.api.condition.EnabledIf(
        value = "sh.ravix.testsupport.Docker#available",
        disabledReason = "Docker not available — skipping Postgres-backed integration test")
class AuthFlowTest {

    @Test
    void loginWithSeededAdminReturnsToken() {
        given().contentType("application/json")
                .body("{\"username\":\"admin@example.com\",\"password\":\"ravix-admin\"}")
                .when().post("/api/auth/login")
                .then().statusCode(200)
                .body("token", notNullValue());
    }

    @Test
    void loginWithWrongPasswordIsRejected() {
        given().contentType("application/json")
                .body("{\"username\":\"admin@example.com\",\"password\":\"definitely-wrong\"}")
                .when().post("/api/auth/login")
                .then().statusCode(401);
    }

    @Test
    void protectedEndpointRequiresAuth() {
        given().when().get("/api/auth/me")
                .then().statusCode(anyOf(is(401), is(403)));
    }

    /**
     * The panel authenticates by cookie, and that cookie must be unreadable from
     * JavaScript — otherwise an XSS bug in the panel hands over a live session.
     */
    @Test
    void loginSetsAnHttpOnlySameSiteSessionCookie() {
        String setCookie = given().contentType("application/json")
                .body("{\"username\":\"admin@example.com\",\"password\":\"ravix-admin\"}")
                .when().post("/api/auth/login")
                .then().statusCode(200)
                .extract().header("Set-Cookie");

        org.junit.jupiter.api.Assertions.assertNotNull(setCookie, "login must set a session cookie");
        org.junit.jupiter.api.Assertions.assertTrue(
                setCookie.startsWith("ravix_session="), "cookie name: " + setCookie);
        org.junit.jupiter.api.Assertions.assertTrue(
                setCookie.contains("HttpOnly"), "cookie must be HttpOnly: " + setCookie);
        org.junit.jupiter.api.Assertions.assertTrue(
                setCookie.contains("SameSite=Strict"),
                "SameSite=Strict is what stands in for CSRF protection: " + setCookie);
    }

    /** The session cookie alone must authenticate a protected endpoint. */
    @Test
    void sessionCookieAuthenticatesProtectedEndpoints() {
        String token = given().contentType("application/json")
                .body("{\"username\":\"admin@example.com\",\"password\":\"ravix-admin\"}")
                .when().post("/api/auth/login")
                .then().statusCode(200)
                .extract().path("token");

        given().cookie("ravix_session", token)
                .when().get("/api/auth/me")
                .then().statusCode(200)
                .body("email", is("admin@example.com"));
    }

    /**
     * Repeated wrong passwords must start returning 429 rather than letting a
     * guesser run unbounded. Uses an account that does not exist so the shared
     * admin bucket — and the rest of the suite — is left alone.
     */
    @Test
    void repeatedFailuresAreRateLimited() {
        String body = "{\"username\":\"brute-force-probe@example.com\",\"password\":\"wrong\"}";
        for (int i = 0; i < 5; i++) {
            given().contentType("application/json").body(body)
                    .when().post("/api/auth/login")
                    .then().statusCode(401);
        }
        given().contentType("application/json").body(body)
                .when().post("/api/auth/login")
                .then().statusCode(429)
                .header("Retry-After", notNullValue());
    }
}
