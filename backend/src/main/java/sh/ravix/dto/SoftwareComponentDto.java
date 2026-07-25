package sh.ravix.dto;

import java.util.List;

public record SoftwareComponentDto(
        String id,
        String name,
        String description,
        String pkg,
        boolean installed,
        String version,
        boolean hasService,
        String serviceState,
        List<ConfigFileDto> configs) {

    public record ConfigFileDto(String path, String label, boolean exists) {}
}
