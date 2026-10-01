package pe.edu.hidromejora.enums;

/**
 * Estados de un corte de servicio dentro de Hidro Mejora (modelo TO-BE).
 *
 * <p>Corresponden a los valores del arreglo {@code CORTES} de la aplicación
 * web. Toda la información de cortes del prototipo es demostrativa y no
 * afirma una afectación real del suministro.</p>
 */
public enum EstadoCorte {

    /** Interrupción anunciada para una fecha y horario futuros. */
    PROGRAMADO,

    /** Trabajo o incidencia en atención al momento de la consulta. */
    EN_PROCESO,

    /** Servicio ya normalizado tras la intervención. */
    RESTABLECIDO
}
