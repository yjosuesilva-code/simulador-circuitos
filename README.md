# Simulador de Circuitos Eléctricos

Aplicación web para dibujar circuitos eléctricos y simularlos en **DC**, **AC (fasores)** y **transitorio (RC/RL)**.

## Tecnologías

HTML · CSS · JavaScript (ES Modules) · SVG · Bootstrap 5 · Chart.js

## Cómo ejecutarlo

1. Clonar el repositorio:
   ```bash
   git clone <url-del-repo>
   ```
2. Abrir la carpeta en VS Code.
3. Instalar la extensión **Live Server** (Ritwick Dey).
4. Clic derecho sobre `index.html` → **Open with Live Server**.

> Abrir `index.html` con doble clic **no funciona**: los ES Modules requieren un servidor.

## Uso del editor

| Acción | Cómo |
|---|---|
| Agregar componente | Arrastrarlo desde la barra izquierda al lienzo (o clic: aparece en el centro) |
| Mover | Arrastrar el componente; los cables lo siguen en forma de L |
| Trazar cable | Arrastrar desde un terminal hasta el destino |
| Seleccionar | Clic sobre un componente o cable |
| Rotar | <kbd>R</kbd> o botón ⟳ |
| Eliminar | <kbd>Supr</kbd> o botón ✕ |
| Deshacer / rehacer | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> o botones ↶ ↷ |
| Cancelar | <kbd>Esc</kbd> (quita la selección o cancela el arrastre en curso) |

- Los terminales **rojos** están sin conectar.
- Un cable que termina en medio de otro (forma de T) se conecta; dos cables que solo se cruzan (forma de X) no.
- Un componente no se puede soltar encima de otro: se marca en rojo y vuelve a su lugar.

## Documentación

- [Arquitectura y contratos entre módulos](docs/ARQUITECTURA.md)

## Integrantes

| Integrante | Módulo |
|---|---|
| Yilver Silva | Editor visual |
| _por definir_ | Modelo y netlist |
| _por definir_ | Motor DC y AC |
| _por definir_ | Transitorio y resultados |
