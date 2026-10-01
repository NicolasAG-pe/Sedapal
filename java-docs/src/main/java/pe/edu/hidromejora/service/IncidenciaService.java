package pe.edu.hidromejora.service;

import java.util.List;

import pe.edu.hidromejora.model.Incidencia;

/**
 * Operaciones de incidencias de Hidro Mejora (modelo TO-BE).
 *
 * <p>Interfaz de <strong>documentación</strong>: describe el registro y la
 * consulta de reportes que hoy gestiona el JavaScript con el arreglo
 * {@code incidencias[]} y la persistencia local del navegador. No existe
 * implementación ni backend asociado.</p>
 */
public interface IncidenciaService {

    /**
     * Registra una incidencia con los datos del formulario web y genera su
     * código de seguimiento con formato “INC-2026-número”.
     *
     * @param incidencia reporte a registrar
     * @return la incidencia registrada con código asignado
     */
    Incidencia registrarIncidencia(Incidencia incidencia);

    /**
     * Lista las incidencias registradas en la sesión del suministro.
     *
     * @param numeroSuministro suministro consultado
     * @return reportes del suministro
     */
    List<Incidencia> listarPorSuministro(String numeroSuministro);
}
