package pe.edu.hidromejora.assistant;

/**
 * Intenciones que reconoce HidroBot dentro de Hidro Mejora (modelo TO-BE).
 *
 * <p>Cada valor corresponde a un identificador del arreglo
 * {@code HIDROBOT_INTENTS} del prototipo web, que la función
 * {@code detectBotIntent()} asigna al mensaje del usuario. HidroBot es un
 * asistente local basado en reglas, sin inteligencia artificial externa.</p>
 */
public enum IntencionHidroBot {

    /** Cortes filtrados por un distrito mencionado. */
    CORTES_DISTRITO("cuts_district"),

    /** Reporte de falta de agua. */
    FALTA_AGUA("no_water"),

    /** Reporte de baja presión. */
    BAJA_PRESION("low_pressure"),

    /** Fuga, rotura de tubería o aniego. */
    FUGA("leak"),

    /** Consulta del recibo más reciente. */
    ULTIMO_RECIBO("last_receipt"),

    /** Recibos pendientes o vencidos y deuda acumulada. */
    RECIBOS_PENDIENTES("pending_receipts"),

    /** Intención de pagar un recibo con el flujo simulado. */
    PAGO("payment"),

    /** Descarga de copias en PDF. */
    PDF("pdf"),

    /** Historial general de recibos. */
    RECIBOS("receipts"),

    /** Consumo actual frente al promedio de los últimos meses. */
    CONSUMO("consumption"),

    /** Módulo de cortes de servicio. */
    CORTES("cuts"),

    /** Incidencias guardadas en el navegador. */
    MIS_INCIDENCIAS("my_incidents"),

    /** Registro genérico de una incidencia. */
    INCIDENCIA("incident"),

    /** Estado del suministro mostrado en el prototipo. */
    ESTADO_SERVICIO("service_status"),

    /** Canales de Atención al Cliente. */
    ATENCION_CLIENTE("customer_service"),

    /** Reinicio del tutorial guiado. */
    TUTORIAL("tutorial"),

    /** Ayuda contextual según la página activa. */
    AYUDA_CONTEXTO("context_help"),

    /** Saludos. */
    SALUDO("greeting"),

    /** Agradecimientos. */
    AGRADECIMIENTO("thanks"),

    /** Consulta fuera del alcance del asistente. */
    DESCONOCIDO("unknown");

    private final String identificadorWeb;

    IntencionHidroBot(String identificadorWeb) {
        this.identificadorWeb = identificadorWeb;
    }

    /**
     * Devuelve el identificador usado en el JavaScript del prototipo,
     * útil para trazar cada intención con {@code HIDROBOT_INTENTS}.
     *
     * @return identificador de la intención en la aplicación web
     */
    public String getIdentificadorWeb() {
        return identificadorWeb;
    }
}
