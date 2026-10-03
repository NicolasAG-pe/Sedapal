package pe.edu.hidromejora.enums;

/**
 * Categorías de incidencia disponibles en el formulario
 * “Reportar incidencia” de Hidro Mejora (modelo TO-BE).
 *
 * <p>Los valores reproducen exactamente las opciones del elemento
 * {@code select#inc-tipo} del prototipo web. No se agregan categorías
 * adicionales.</p>
 */
public enum TipoIncidencia {

    /** Fuga de agua en la red o en instalaciones. */
    FUGA_AGUA("Fuga de agua"),

    /** Interrupción o ausencia del suministro. */
    FALTA_AGUA("Falta de agua"),

    /** Presión por debajo de lo esperado. */
    BAJA_PRESION("Baja presión"),

    /** Tubería rota. */
    ROTURA_TUBERIA("Rotura de tubería"),

    /** Inconvenientes con el medidor del suministro. */
    PROBLEMA_MEDIDOR("Problema con medidor"),

    /** Acumulación de agua por rotura o fuga. */
    ANIEGO("Aniego"),

    /** Reclamo relacionado con la facturación del recibo. */
    FACTURACION("Facturación"),

    /** Cualquier otro caso no contemplado. */
    OTRO("Otro");

    private final String etiquetaWeb;

    TipoIncidencia(String etiquetaWeb) {
        this.etiquetaWeb = etiquetaWeb;
    }

    /**
     * Devuelve el texto tal como aparece en el formulario web, útil para
     * trazar el modelo Java con la interfaz del prototipo.
     *
     * @return etiqueta visible en el {@code select} de incidencias
     */
    public String getEtiquetaWeb() {
        return etiquetaWeb;
    }
}
