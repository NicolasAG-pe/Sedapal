package pe.edu.hidromejora.model;

/**
 * Suministro de agua potable atendido por Hidro Mejora (modelo TO-BE).
 *
 * <p>En el prototipo web el suministro es la llave de la sesión
 * demostrativa: el formulario {@code login-form} solicita únicamente el
 * número de suministro y una clave de demostración. No existen datos
 * personales asociados, por lo que este modelo no incluye DNI, teléfono ni
 * dirección real.</p>
 *
 * <p>Se relaciona con {@link HistorialRecibos}, que agrupa los 12 recibos
 * de referencia del suministro.</p>
 */
public class Suministro {

    /** Longitud mínima aceptada para el número de suministro. */
    public static final int LONGITUD_MINIMA = 7;

    /** Longitud máxima aceptada para el número de suministro. */
    public static final int LONGITUD_MAXIMA = 9;

    private String numero;
    private String estadoServicio;

    /**
     * Crea un suministro con servicio activo, estado mostrado por el
     * prototipo para toda sesión demostrativa.
     *
     * @param numero número de suministro de 7 a 9 dígitos
     */
    public Suministro(String numero) {
        this(numero, "Activo");
    }

    /**
     * Crea un suministro con el estado de servicio indicado.
     *
     * @param numero número de suministro de 7 a 9 dígitos
     * @param estadoServicio estado mostrado en la interfaz, por ejemplo “Activo”
     */
    public Suministro(String numero, String estadoServicio) {
        this.numero = numero;
        this.estadoServicio = estadoServicio;
    }

    /**
     * Verifica la regla de validación del formulario de acceso: solo
     * dígitos con longitud entre 7 y 9.
     *
     * @param numero valor ingresado por el usuario
     * @return {@code true} si cumple el formato demostrativo aceptado
     */
    public static boolean esNumeroValido(String numero) {
        return numero != null && numero.matches("\\d{7,9}");
    }

    public String getNumero() {
        return numero;
    }

    public void setNumero(String numero) {
        this.numero = numero;
    }

    public String getEstadoServicio() {
        return estadoServicio;
    }

    public void setEstadoServicio(String estadoServicio) {
        this.estadoServicio = estadoServicio;
    }
}
