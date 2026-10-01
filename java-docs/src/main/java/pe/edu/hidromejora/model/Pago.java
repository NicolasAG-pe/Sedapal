package pe.edu.hidromejora.model;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Pago de un recibo dentro de Hidro Mejora (modelo TO-BE).
 *
 * <p>Representa el flujo demostrativo del modal de pago: el usuario elige
 * un método simulado (tarjeta, banca móvil o billetera digital), confirma
 * el monto y el prototipo genera un código de operación con formato
 * “PAG-año-número”. <strong>Es un pago simulado</strong>: no se procesa
 * dinero real ni se registra información bancaria.</p>
 */
public class Pago {

    private String codigoOperacion;
    private String numeroRecibo;
    private BigDecimal monto;
    private LocalDate fecha;
    private String metodo;

    /** Crea un pago vacío para construcción por etapas. */
    public Pago() {
    }

    /**
     * Crea el registro de un pago simulado ya confirmado.
     *
     * @param codigoOperacion código demostrativo generado, por ejemplo “PAG-2026-482913”
     * @param numeroRecibo recibo cancelado con este pago
     * @param monto importe cancelado, igual al monto del recibo
     * @param fecha fecha del registro demostrativo
     * @param metodo método elegido: tarjeta, banca móvil o billetera digital
     */
    public Pago(String codigoOperacion, String numeroRecibo, BigDecimal monto,
                LocalDate fecha, String metodo) {
        this.codigoOperacion = codigoOperacion;
        this.numeroRecibo = numeroRecibo;
        this.monto = monto;
        this.fecha = fecha;
        this.metodo = metodo;
    }

    public String getCodigoOperacion() {
        return codigoOperacion;
    }

    public void setCodigoOperacion(String codigoOperacion) {
        this.codigoOperacion = codigoOperacion;
    }

    public String getNumeroRecibo() {
        return numeroRecibo;
    }

    public void setNumeroRecibo(String numeroRecibo) {
        this.numeroRecibo = numeroRecibo;
    }

    public BigDecimal getMonto() {
        return monto;
    }

    public void setMonto(BigDecimal monto) {
        this.monto = monto;
    }

    public LocalDate getFecha() {
        return fecha;
    }

    public void setFecha(LocalDate fecha) {
        this.fecha = fecha;
    }

    public String getMetodo() {
        return metodo;
    }

    public void setMetodo(String metodo) {
        this.metodo = metodo;
    }
}
