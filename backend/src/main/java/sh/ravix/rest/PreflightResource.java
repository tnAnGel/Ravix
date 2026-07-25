package sh.ravix.rest;

import jakarta.ws.rs.OPTIONS;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

/**
 * Catch-all handler for CORS preflight.
 *
 * Without an explicit resource, RESTEasy answers {@code OPTIONS} through its own
 * default path, which does not run the JAX-RS filter chain — so
 * {@link sh.ravix.auth.CorsFilter} never gets to attach the headers and the
 * browser rejects the real request that follows. Routing OPTIONS through a
 * normal resource puts it back on the filtered path.
 *
 * The body is empty and the status is 204; everything the browser needs is in
 * the headers, which CorsFilter adds on the way out. {@code AuthFilter} lets
 * OPTIONS through unauthenticated, as it must — a preflight carries no
 * credentials by design.
 */
@Path("/api")
public class PreflightResource {

    @OPTIONS
    @Path("{path:.*}")
    public Response preflight(@PathParam("path") String path) {
        return Response.noContent().build();
    }
}
