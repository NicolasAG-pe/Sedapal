package pe.edu.hidromejora.service;

import java.util.List;
import java.util.Optional;

import pe.edu.hidromejora.enums.EstadoRecibo;
import pe.edu.hidromejora.model.Recibo;

/**
 * Operaciones sobre recibos de Hidro Mejora (modelo TO-BE).
 *
 * <p>Interfaz de <strong>documentación</strong>: describe cómo podría
 * separarse la lógica que hoy vive en el JavaScript del prototipo
 * (arreglo {@code recibos[]}, {@code renderCards()},
 * {@code renderChart()}, {@code renderSpendChart()}). No existe
 * implementación ni backend asociado.</p>
 */
public interface ReciboService {

    /**
     * Obtiene los recibos de un suministro, hoy generados por
     * {@code generarRecibos()} en cada sesión demostrativa.
     *
     * @param numeroSuministro suministro consultado
     * @return historial de recibos del suministro
     */
    List<Recibo> obtenerRecibosPorSuministro(String numeroSuministro);

    /**
     * Busca un recibo por su número visible.
     *
     * @param numeroRecibo código del recibo
     * @return el recibo cuando existe
     */
    Optional<Recibo> buscarRecibo(String numeroRecibo);

    /**
     * Filtra recibos por estado, como los chips Todos/Pagado/Pendiente/Vencido.
     *
     * @param numeroSuministro suministro consultado
     * @param estado estado por el cual filtrar
     * @return recibos en dicho estado
     */
    List<Recibo> filtrarPorEstado(String numeroSuministro, EstadoRecibo estado);
}
