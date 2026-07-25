package sh.ravix.it;

import static io.restassured.RestAssured.given;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import sh.ravix.testsupport.PostgresResource;

/** Smoke tests for key read endpoints behind auth, against a real DB. */
@QuarkusTest
@QuarkusTestResource(PostgresResource.class)
@org.junit.jupiter.api.condition.EnabledIf(
        value = "sh.ravix.testsupport.Docker#available",
        disabledReason = "Docker not available — skipping Postgres-backed integration test")
class AuthorizedApiTest {

    private static String token() {
        return given().contentType("application/json")
                .body("{\"username\":\"admin@example.com\",\"password\":\"ravix-admin\"}")
                .when().post("/api/auth/login")
                .then().statusCode(200)
                .extract().path("token");
    }

    private static io.restassured.specification.RequestSpecification authed() {
        return given().header("Authorization", "Bearer " + token());
    }

    @Test
    void domainsListIsReachable() {
        authed().when().get("/api/domains").then().statusCode(200);
    }

    @Test
    void servicesListIsReachable() {
        authed().when().get("/api/services").then().statusCode(200);
    }

    @Test
    void monitoringAlertsAreReachable() {
        authed().when().get("/api/monitoring/alerts").then().statusCode(200);
    }
}
