package pe.edu.hidromejora.service;

import java.util.Optional;

import pe.edu.hidromejora.model.Pago;
import pe.edu.hidromejora.model.Recibo;

/**
 * Operaciones del pago simulado de Hidro Mejora (modelo TO-BE).
 *
 * <p>Interfaz de <strong>documentación</strong>: representa el flujo del
 * modal de pago del prototipo ({@code abrirPago()}), que confirma el
 * monto, genera un código “PAG-año-número” y marca el recibo como pagado.
 * La implementación web actual es <strong>simulada</strong>, sin cargos
 * reales.</p>
 */
public interface PagoService {

    /**
     * Procesa el pago simulado de un recibo pendiente o vencido.
     *
     * @param recibo recibo a cancelar
     * @param metodo método elegido: tarjeta, banca móvil o billetera digital
     * @return registro demostrativo del pago con su código de operación
     */
    Pago procesarPago(Recibo recibo, String metodo);

    /**
     * Consulta el pago asociado a un recibo, si fue cancelado con el flujo
     * simulado.
     *
     * @param numeroRecibo código del recibo
     * @return el pago cuando existe
     */
    Optional<Pago> consultarPagoDeRecibo(String numeroRecibo);
}
