package pe.edu.hidromejora.service;

import java.util.List;

import pe.edu.hidromejora.model.CorteServicio;

/**
 * Operaciones de cortes de servicio de Hidro Mejora (modelo TO-BE).
 *
 * <p>Interfaz de <strong>documentación</strong>: representa la consulta y
 * el filtrado por distrito que hoy realiza {@code renderCortes()} sobre el
 * arreglo demostrativo {@code CORTES}. No existe implementación ni backend
 * asociado.</p>
 */
public interface CorteService {

    /**
     * Lista los cortes de servicio demostrativos disponibles.
     *
     * @return cortes registrados en el prototipo
     */
    List<CorteServicio> listarCortes();

    /**
     * Filtra cortes por distrito o zona, como el buscador de la vista de
     * cortes del prototipo.
     *
     * @param criterio texto ingresado en la búsqueda
     * @return cortes coincidentes
     */
    List<CorteServicio> buscarPorDistrito(String criterio);
}
