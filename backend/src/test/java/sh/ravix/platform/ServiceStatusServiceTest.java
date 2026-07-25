package sh.ravix.platform;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import sh.ravix.entity.ServiceStatus;

/** Pure unit test for the up/down classification (no Quarkus, no systemd). */
class ServiceStatusServiceTest {

    private static ServiceStatus withState(String state) {
        ServiceStatus s = new ServiceStatus();
        s.name = "svc";
        s.state = state;
        return s;
    }

    @Test
    void runningAndActiveCountAsUp() {
        assertTrue(ServiceStatusService.isUp(withState("running")));
        assertTrue(ServiceStatusService.isUp(withState("active")));
        assertTrue(ServiceStatusService.isUp(withState("ACTIVE")));   // case-insensitive
        assertTrue(ServiceStatusService.isUp(withState("up")));
        assertTrue(ServiceStatusService.isUp(withState("online")));
    }

    @Test
    void stoppedFailedAndUnknownCountAsDown() {
        assertFalse(ServiceStatusService.isUp(withState("stopped")));
        assertFalse(ServiceStatusService.isUp(withState("failed")));
        assertFalse(ServiceStatusService.isUp(withState("inactive")));
        assertFalse(ServiceStatusService.isUp(withState("degraded")));
        assertFalse(ServiceStatusService.isUp(withState(null)));
        assertFalse(ServiceStatusService.isUp(withState("")));
    }
}
