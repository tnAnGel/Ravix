package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;
import sh.ravix.platform.RblService;

/** RBL / DNSBL blacklist monitoring of the server's mail IP(s). */
@Path("/api/rbl")
@Produces(MediaType.APPLICATION_JSON)
public class RblResource {

    @Inject
    RblService rbl;

    /** Latest stored results (fast — no DNS queries). */
    @GET
    public List<RblService.IpResult> latest() {
        List<RblService.IpResult> stored = rbl.latest();
        return stored.isEmpty() ? rbl.scanAndStore() : stored;
    }

    /** The DNSBL zones checked. */
    @GET
    @Path("/zones")
    public List<String> zones() {
        return RblService.ZONES;
    }

    /** Force a fresh scan now. */
    @POST
    @Path("/scan")
    public List<RblService.IpResult> scan() {
        return rbl.scanAndStore();
    }
}
