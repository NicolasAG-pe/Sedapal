package pe.edu.hidromejora.assistant;

/**
 * Asistente virtual de Hidro Mejora (modelo TO-BE).
 *
 * <p>HidroBot <strong>no es inteligencia artificial</strong>: es un
 * asistente local basado en reglas que identifica la intención del mensaje
 * ({@code detectBotIntent()} en el prototipo) y construye una respuesta con
 * datos de la sesión ({@code handleBotIntent()}). Toda la conversación
 * ocurre en el navegador, sin backend ni servicios externos.</p>
 *
 * <p>Esta clase documenta su responsabilidad conceptual: detectar la
 * intención y generar la respuesta. La implementación funcional reside en
 * el JavaScript del prototipo web.</p>
 */
public class HidroBot {

    private boolean abierto;
    private boolean saludoMostrado;

    /** Crea el asistente en estado minimizado y sin saludo inicial. */
    public HidroBot() {
        this.abierto = false;
        this.saludoMostrado = false;
    }

    /**
     * Identifica la intención de un mensaje del usuario, equivalente
     * conceptual a {@code detectBotIntent()} del prototipo.
     *
     * @param mensaje texto ingresado por el usuario
     * @return intención detectada o {@code DESCONOCIDO} si está fuera de alcance
     */
    public IntencionHidroBot detectarIntencion(String mensaje) {
        if (mensaje == null || mensaje.isBlank()) {
            return IntencionHidroBot.DESCONOCIDO;
        }
        return IntencionHidroBot.DESCONOCIDO;
    }

    /**
     * Genera la respuesta correspondiente a una intención, equivalente
     * conceptual a {@code handleBotIntent()}: consulta recibos, consumo,
     * incidencias, cortes o tutorial según el caso.
     *
     * @param intencion intención detectada en el mensaje
     * @return texto de respuesta del asistente
     */
    public String generarRespuesta(IntencionHidroBot intencion) {
        if (intencion == null) {
            intencion = IntencionHidroBot.DESCONOCIDO;
        }
        return "Puedo ayudarte con recibos, consumo, incidencias, cortes de servicio y tutorial.";
    }

    public boolean isAbierto() {
        return abierto;
    }

    public void setAbierto(boolean abierto) {
        this.abierto = abierto;
    }

    public boolean isSaludoMostrado() {
        return saludoMostrado;
    }

    public void setSaludoMostrado(boolean saludoMostrado) {
        this.saludoMostrado = saludoMostrado;
    }
}
