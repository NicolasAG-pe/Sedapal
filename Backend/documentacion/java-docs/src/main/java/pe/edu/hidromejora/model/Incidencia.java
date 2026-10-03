package pe.edu.hidromejora.model;

import java.time.LocalDate;

import pe.edu.hidromejora.enums.TipoIncidencia;

/**
 * Incidencia reportada por el usuario dentro de Hidro Mejora (modelo TO-BE).
 *
 * <p>Reproduce los datos del formulario “Reportar incidencia”: código con
 * formato “INC-2026-número”, tipo, descripción, dirección de referencia,
 * suministro, fecha, coordenadas opcionales y un indicador de fotografía.
 * La fotografía solo se conserva durante la sesión web; en el modelo
 * persiste únicamente {@code tieneFoto}, nunca la imagen en Base64.</p>
 *
 * <p>Las incidencias del prototipo se guardan en el navegador y no se
 * envían a ningún servidor.</p>
 */
public class Incidencia {

    private String codigo;
    private TipoIncidencia tipo;
    private String descripcion;
    private String direccionReferencia;
    private String numeroSuministro;
    private LocalDate fecha;
    private String coordenadas;
    private boolean tieneFoto;

    /** Crea una incidencia vacía para construcción por etapas. */
    public Incidencia() {
    }

    /**
     * Crea una incidencia con sus datos obligatorios de registro.
     *
     * @param codigo código de seguimiento, por ejemplo “INC-2026-482913”
     * @param tipo categoría elegida en el formulario
     * @param descripcion detalle con al menos 10 caracteres según la validación web
     * @param direccionReferencia dirección o punto de referencia del reporte
     * @param numeroSuministro suministro asociado al reporte
     */
    public Incidencia(String codigo, TipoIncidencia tipo, String descripcion,
                      String direccionReferencia, String numeroSuministro) {
        this.codigo = codigo;
        this.tipo = tipo;
        this.descripcion = descripcion;
        this.direccionReferencia = direccionReferencia;
        this.numeroSuministro = numeroSuministro;
    }

    public String getCodigo() {
        return codigo;
    }

    public void setCodigo(String codigo) {
        this.codigo = codigo;
    }

    public TipoIncidencia getTipo() {
        return tipo;
    }

    public void setTipo(TipoIncidencia tipo) {
        this.tipo = tipo;
    }

    public String getDescripcion() {
        return descripcion;
    }

    public void setDescripcion(String descripcion) {
        this.descripcion = descripcion;
    }

    public String getDireccionReferencia() {
        return direccionReferencia;
    }

    public void setDireccionReferencia(String direccionReferencia) {
        this.direccionReferencia = direccionReferencia;
    }

    public String getNumeroSuministro() {
        return numeroSuministro;
    }

    public void setNumeroSuministro(String numeroSuministro) {
        this.numeroSuministro = numeroSuministro;
    }

    public LocalDate getFecha() {
        return fecha;
    }

    public void setFecha(LocalDate fecha) {
        this.fecha = fecha;
    }

    /**
     * Devuelve las coordenadas opcionales en formato “latitud, longitud”.
     *
     * @return coordenadas o {@code null} si no se compartió ubicación
     */
    public String getCoordenadas() {
        return coordenadas;
    }

    public void setCoordenadas(String coordenadas) {
        this.coordenadas = coordenadas;
    }

    public boolean isTieneFoto() {
        return tieneFoto;
    }

    public void setTieneFoto(boolean tieneFoto) {
        this.tieneFoto = tieneFoto;
    }
}
