package pe.edu.hidromejora.service;

import pe.edu.hidromejora.model.Recibo;

/**
 * Generación de comprobantes en PDF de Hidro Mejora (modelo TO-BE).
 *
 * <p>Interfaz de <strong>documentación</strong>: el prototipo genera los
 * documentos en el navegador con jsPDF mediante
 * {@code generarReciboPDF(recibo, opciones)}, con modo {@code receipt}
 * para el recibo y modo {@code payment} para la constancia de pago
 * demostrativa. Todos los documentos se identifican como prototipo
 * académico sin valor oficial.</p>
 */
public interface ComprobanteService {

    /**
     * Genera el comprobante en PDF de un recibo.
     *
     * @param recibo recibo a documentar
     * @return arreglo de bytes del documento generado
     */
    byte[] generarReciboPdf(Recibo recibo);

    /**
     * Genera la constancia de pago demostrativa de un recibo ya cancelado
     * con el flujo simulado, incluyendo su código de operación.
     *
     * @param recibo recibo pagado con código de operación registrado
     * @return arreglo de bytes del documento generado
     */
    byte[] generarConstanciaPago(Recibo recibo);
}
