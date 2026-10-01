package pe.edu.hidromejora.model;

import java.time.LocalDate;

import pe.edu.hidromejora.enums.EstadoCorte;

/**
 * Corte de servicio mostrado en Hidro Mejora (modelo TO-BE).
 *
 * <p>Reproduce cada elemento del arreglo {@code CORTES} del prototipo:
 * distrito, zona, fecha, horario, motivo y estado. Toda la información es
 * demostrativa y el propio prototipo aclara que no afirma una afectación
 * real del suministro consultado.</p>
 */
public class CorteServicio {

    private String distrito;
    private String zona;
    private LocalDate fecha;
    private String horario;
    private String motivo;
    private EstadoCorte estado;

    /** Crea un corte vacío para construcción por etapas. */
    public CorteServicio() {
    }

    /**
     * Crea un corte de servicio con sus datos de programación.
     *
     * @param distrito distrito donde se registra la intervención
     * @param zona zona o sector específico dentro del distrito
     * @param fecha fecha de la intervención
     * @param horario rango horario visible, por ejemplo “08:00 – 14:00”
     * @param motivo causa informada, por ejemplo mantenimiento de red
     * @param estado situación actual del corte
     */
    public CorteServicio(String distrito, String zona, LocalDate fecha,
                         String horario, String motivo, EstadoCorte estado) {
        this.distrito = distrito;
        this.zona = zona;
        this.fecha = fecha;
        this.horario = horario;
        this.motivo = motivo;
        this.estado = estado;
    }

    public String getDistrito() {
        return distrito;
    }

    public void setDistrito(String distrito) {
        this.distrito = distrito;
    }

    public String getZona() {
        return zona;
    }

    public void setZona(String zona) {
        this.zona = zona;
    }

    public LocalDate getFecha() {
        return fecha;
    }

    public void setFecha(LocalDate fecha) {
        this.fecha = fecha;
    }

    public String getHorario() {
        return horario;
    }

    public void setHorario(String horario) {
        this.horario = horario;
    }

    public String getMotivo() {
        return motivo;
    }

    public void setMotivo(String motivo) {
        this.motivo = motivo;
    }

    public EstadoCorte getEstado() {
        return estado;
    }

    public void setEstado(EstadoCorte estado) {
        this.estado = estado;
    }
}
