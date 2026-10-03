package pe.edu.hidromejora.model;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

import pe.edu.hidromejora.enums.EstadoRecibo;

/**
 * Historial de recibos de un suministro dentro de Hidro Mejora
 * (modelo TO-BE).
 *
 * <p>Agrupa los 12 recibos de referencia que el prototipo web genera por
 * sesión demostrativa y concentra las operaciones de consulta que en
 * JavaScript realizan {@code renderCards()}, los filtros por estado, la
 * búsqueda por mes y los gráficos de consumo y gasto.</p>
 */
public class HistorialRecibos {

    private String numeroSuministro;
    private final List<Recibo> recibos;

    /**
     * Crea un historial vacío asociado a un suministro.
     *
     * @param numeroSuministro número de suministro dueño del historial
     */
    public HistorialRecibos(String numeroSuministro) {
        this.numeroSuministro = numeroSuministro;
        this.recibos = new ArrayList<>();
    }

    /**
     * Devuelve todos los recibos en orden cronológico descendente
     * (el más reciente primero), igual que el arreglo {@code recibos[]}.
     *
     * @return lista de recibos del suministro
     */
    public List<Recibo> listarRecibos() {
        return new ArrayList<>(recibos);
    }

    /**
     * Busca un recibo por su número visible.
     *
     * @param numeroRecibo código del recibo, por ejemplo “R-2026-09-2450”
     * @return el recibo cuando existe
     */
    public Optional<Recibo> buscarRecibo(String numeroRecibo) {
        return recibos.stream()
                .filter(r -> r.getNumeroRecibo() != null && r.getNumeroRecibo().equals(numeroRecibo))
                .findFirst();
    }

    /**
     * Filtra el historial por estado, equivalente a los chips
     * Todos/Pagado/Pendiente/Vencido de la vista de recibos.
     *
     * @param estado estado por el cual filtrar
     * @return recibos que presentan dicho estado
     */
    public List<Recibo> filtrarPorEstado(EstadoRecibo estado) {
        return recibos.stream()
                .filter(r -> r.getEstado() == estado)
                .collect(Collectors.toList());
    }

    /**
     * Obtiene los recibos más recientes, base de los gráficos de consumo
     * (función {@code ultimos6()} en el prototipo).
     *
     * @param cantidad cantidad de recibos recientes a obtener
     * @return sublista con los recibos más recientes
     */
    public List<Recibo> obtenerUltimosRecibos(int cantidad) {
        int limite = Math.max(0, Math.min(cantidad, recibos.size()));
        return new ArrayList<>(recibos.subList(0, limite));
    }

    /**
     * Calcula el promedio de consumo de los últimos meses, equivalente a
     * {@code promedio6()} y mostrado en el chip, la línea y la leyenda del
     * gráfico de consumo.
     *
     * @param cantidad cantidad de meses recientes a promediar
     * @return promedio de m³ con un decimal
     */
    public double calcularPromedioConsumo(int cantidad) {
        List<Recibo> ultimos = obtenerUltimosRecibos(cantidad);
        if (ultimos.isEmpty()) {
            return 0.0;
        }
        double suma = ultimos.stream().mapToDouble(Recibo::getConsumoM3).sum();
        return Math.round((suma / ultimos.size()) * 10.0) / 10.0;
    }

    /**
     * Calcula el promedio de gasto de los últimos meses, mostrado en el
     * gráfico de evolución del gasto del prototipo.
     *
     * @param cantidad cantidad de meses recientes a promediar
     * @return promedio en soles con dos decimales
     */
    public BigDecimal calcularPromedioGasto(int cantidad) {
        List<Recibo> ultimos = obtenerUltimosRecibos(cantidad);
        if (ultimos.isEmpty()) {
            return BigDecimal.ZERO.setScale(2);
        }
        BigDecimal suma = ultimos.stream()
                .map(Recibo::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return suma.divide(BigDecimal.valueOf(ultimos.size()), 2, RoundingMode.HALF_UP);
    }

    /**
     * Suma la deuda de los recibos pendientes y vencidos, valor que
     * HidroBot reporta al consultar los recibos por pagar.
     *
     * @return deuda acumulada en soles
     */
    public BigDecimal calcularDeudaAcumulada() {
        return recibos.stream()
                .filter(Recibo::tieneDeudaPendiente)
                .map(Recibo::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public String getNumeroSuministro() {
        return numeroSuministro;
    }

    public void setNumeroSuministro(String numeroSuministro) {
        this.numeroSuministro = numeroSuministro;
    }
}
