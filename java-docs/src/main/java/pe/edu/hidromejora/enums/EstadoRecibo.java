package pe.edu.hidromejora.enums;

/**
 * Estados que puede presentar un recibo dentro de Hidro Mejora (modelo TO-BE).
 *
 * <p>Corresponden exactamente a los valores que la aplicación web asigna en
 * {@code generarRecibos()}: el recibo más reciente inicia como
 * {@code PENDIENTE}, el segundo como {@code VENCIDO} y el resto sigue una
 * serie demostrativa fija. Un recibo pendiente o vencido puede pasar a
 * {@code PAGADO} mediante el flujo de pago simulado.</p>
 */
public enum EstadoRecibo {

    /** Recibo cancelado mediante el flujo de pago simulado del prototipo. */
    PAGADO,

    /** Recibo vigente aún no cancelado (incluye el recibo más reciente). */
    PENDIENTE,

    /** Recibo no cancelado pasada su fecha de vencimiento demostrativa. */
    VENCIDO
}
