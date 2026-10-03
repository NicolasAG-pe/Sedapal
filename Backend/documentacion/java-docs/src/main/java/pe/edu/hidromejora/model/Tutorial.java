package pe.edu.hidromejora.model;

/**
 * Recorrido guiado de Hidro Mejora (modelo TO-BE).
 *
 * <p>Representa el comportamiento del tutorial por pasos
 * ({@code SPOT_STEPS} en el prototipo, 10 pasos que visitan el resumen,
 * las acciones rápidas, los gráficos, los recibos, las incidencias, los
 * cortes y la atención al cliente). El tutorial se inicia automáticamente
 * en el primer acceso y puede repetirse manualmente con “Ver tutorial”.
 * No modela elementos visuales HTML, solo el estado y la navegación del
 * recorrido.</p>
 */
public class Tutorial {

    private boolean activo;
    private int pasoActual;
    private final int totalPasos;
    private boolean visto;

    /**
     * Crea el estado del tutorial para una sesión.
     *
     * @param totalPasos cantidad de pasos del recorrido (10 en el prototipo)
     * @param visto si el usuario ya completó el tutorial anteriormente
     */
    public Tutorial(int totalPasos, boolean visto) {
        this.totalPasos = totalPasos;
        this.visto = visto;
        this.activo = false;
        this.pasoActual = 0;
    }

    /**
     * Inicia el recorrido desde el primer paso.
     */
    public void iniciar() {
        this.activo = true;
        this.pasoActual = 0;
    }

    /**
     * Avanza al siguiente paso cuando existe uno posterior.
     */
    public void siguiente() {
        if (activo && pasoActual < totalPasos - 1) {
            pasoActual++;
        }
    }

    /**
     * Retrocede al paso anterior cuando no es el primero.
     */
    public void anterior() {
        if (activo && pasoActual > 0) {
            pasoActual--;
        }
    }

    /**
     * Finaliza el recorrido y lo marca como visto, como ocurre al pulsar
     * “Finalizar”, “Omitir” o Escape en el prototipo.
     */
    public void finalizar() {
        this.activo = false;
        this.visto = true;
    }

    /**
     * Reinicia el recorrido para volver a mostrarlo, equivalente al botón
     * “Ver tutorial” del panel de inicio.
     */
    public void reiniciar() {
        iniciar();
    }

    public boolean isActivo() {
        return activo;
    }

    public int getPasoActual() {
        return pasoActual;
    }

    public int getTotalPasos() {
        return totalPasos;
    }

    public boolean isVisto() {
        return visto;
    }
}
