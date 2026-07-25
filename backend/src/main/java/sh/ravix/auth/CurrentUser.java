package sh.ravix.auth;

import jakarta.enterprise.context.RequestScoped;
import sh.ravix.entity.AdminUser;

/** Holds the authenticated admin for the current request. */
@RequestScoped
public class CurrentUser {
    public AdminUser user;
}
