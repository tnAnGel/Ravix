package sh.ravix.auth;

import jakarta.interceptor.InterceptorBinding;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a resource whose tenant-scoped queries must run with the Hibernate
 * {@code orgFilter} enabled. The interceptor enables it INSIDE the request's
 * transaction (see {@link OrgFilterInterceptor}) — enabling it in a JAX-RS
 * request filter does not work because @Transactional opens a different
 * Hibernate session than the one the filter was enabled on.
 */
@InterceptorBinding
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface OrgFiltered {
}
