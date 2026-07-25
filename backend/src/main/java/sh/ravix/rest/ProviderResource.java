package sh.ravix.rest;

import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import sh.ravix.platform.ProviderService;

/** Hosting-provider detection + port-25 playbook with a ready-to-send ticket. */
@Path("/api/provider")
@Produces(MediaType.APPLICATION_JSON)
public class ProviderResource {

    @Inject ProviderService provider;

    @GET
    @Path("/playbook")
    public ProviderService.Playbook playbook() {
        return provider.detect();
    }
}
