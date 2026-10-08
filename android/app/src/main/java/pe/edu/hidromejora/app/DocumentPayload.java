package pe.edu.hidromejora.app;

/** Límites del puente; nunca acepta rutas, nombres de ejecutables ni otros tipos. */
final class DocumentPayload {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static void validate(String name, byte[] data) {
        if (name == null || !name.matches("[A-Za-z0-9_-]{1,180}\\.pdf")) {
            throw new IllegalArgumentException("Nombre de documento no válido.");
        }
        if (data == null || data.length < 5 || data.length > MAX_BYTES ||
            data[0] != '%' || data[1] != 'P' || data[2] != 'D' || data[3] != 'F' || data[4] != '-') {
            throw new IllegalArgumentException("Documento PDF no válido o demasiado grande.");
        }
    }
    private DocumentPayload() {}
}
