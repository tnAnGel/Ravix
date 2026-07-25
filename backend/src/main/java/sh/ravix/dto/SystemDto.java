package sh.ravix.dto;

import java.util.List;
import sh.ravix.entity.CommandCheck;
import sh.ravix.entity.InstallLog;
import sh.ravix.entity.PackageStatus;

public record SystemDto(
        String hostname,
        String version,
        String installMode,
        String os,
        String kernel,
        String arch,
        String uptime,
        String systemUser,
        Paths paths,
        List<PackageStatus> packages,
        List<CommandCheck> commandChecks,
        List<InstallLog> installLog) {

    public record Paths(String app, String config, String data, String logs, String sqlite) {}
}
