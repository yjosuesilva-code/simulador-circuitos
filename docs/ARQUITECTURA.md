# Arquitectura — Simulador de Circuitos Eléctricos

> Documento vivo. Cualquier cambio a los **contratos** (sección 5) se discute con todo el grupo antes de hacer merge, porque rompe el trabajo de los demás.

## 1. Objetivo y alcance

Aplicación web que permite **dibujar un circuito** arrastrando componentes y **simularlo** en tres modos:

| Modo | Qué calcula | Componentes que intervienen |
|---|---|---|
| **DC** | Voltaje en cada nodo y corriente en cada componente (régimen estable) | R, fuente V, fuente I. C = circuito abierto, L = cortocircuito |
| **AC (fasores)** | Magnitud y fase de voltajes y corrientes a una frecuencia `f` | R, C, L, fuente AC |
| **Transitorio** | Evolución en el tiempo de v(t) e i(t) desde `t = 0` hasta `t_final` | R, C, L, fuentes DC |

**Fuera de alcance (por ahora):** diodos, transistores y cualquier componente no lineal, interruptores que cambien en mitad de la simulación, varias frecuencias simultáneas.

**Supuestos:**
- Siempre debe existir un nodo **tierra (GND)**, que es el nodo 0 y la referencia de 0 V.
- En el transitorio los capacitores parten descargados y los inductores sin corriente (condiciones iniciales cero); las fuentes se encienden en `t = 0`.

## 2. Stack

| Tecnología | Uso | Por qué |
|---|---|---|
| HTML + CSS + JavaScript (ES Modules) | Toda la aplicación | Sin framework ni proceso de compilación; los módulos `import/export` separan el trabajo de cada integrante |
| SVG | Lienzo del editor | Cada componente es un elemento del DOM: los eventos de clic/arrastre son directos (con Canvas habría que calcular a mano qué se tocó) |
| Bootstrap 5 (CDN) | Barra de herramientas, panel de propiedades, pestañas, modales | Interfaz consistente sin escribir mucho CSS |
| Chart.js (CDN) | Gráficas del transitorio y de AC | Ligero y fácil de usar |

**Importante:** los ES Modules **no funcionan** abriendo `index.html` con doble clic (`file://`). Hay que usar la extensión **Live Server** de VS Code.

## 3. Capas y flujo de datos

```
┌──────────────┐  CircuitModel  ┌──────────────┐   Netlist   ┌──────────────┐   Results   ┌──────────────┐
│ 1. EDITOR    │ ─────────────► │ 2. MODELO /  │ ──────────► │ 3. MOTOR     │ ──────────► │ 4. RESULTADOS│
│   (SVG)      │                │   NETLIST    │             │ DC · AC · TR │             │ tablas/gráf. │
└──────────────┘                └──────────────┘             └──────────────┘             └──────────────┘
      P1                              P2                         P3 / P4                        P4
```

Regla: **los datos fluyen en una sola dirección.** El motor no sabe nada del SVG y el editor no sabe nada de matrices. Eso permite probar cada capa por separado.

## 4. Estructura de carpetas

```
simulador-circuitos/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js                  # Orquestador: conecta las capas (integración, todos)
│   ├── editor/          (P1)
│   │   ├── geometry.js          # Cuadrícula y posición de terminales (sin DOM, se puede probar sin navegador)
│   │   ├── canvas.js            # Dibuja el estado: cuadrícula, cables, componentes, selección
│   │   ├── interaction.js       # Mouse/teclado → operaciones sobre Circuit (arrastrar, rotar, borrar)
│   │   ├── components.js        # Dibujo SVG de cada tipo de componente
│   │   └── wires.js             # Trazado de cables entre terminales
│   ├── model/           (P2)
│   │   ├── circuit.js           # CircuitModel: agregar/quitar/mover componentes y cables
│   │   ├── netlist.js           # CircuitModel → Netlist (agrupar puntos conectados en nodos)
│   │   ├── validation.js        # Sin tierra, nodos sueltos, valores inválidos
│   │   ├── units.js             # "4.7k" → 4700, "10u" → 1e-5
│   │   └── storage.js           # Guardar/cargar JSON
│   ├── solver/          (P3)
│   │   ├── complex.js           # Clase Complex (suma, mult, división, magnitud, fase)
│   │   ├── linear.js            # Eliminación de Gauss con pivoteo parcial
│   │   ├── mna.js               # Armado de la matriz MNA (stamps)
│   │   ├── dc.js                # Análisis DC
│   │   └── ac.js                # Análisis AC
│   ├── transient/       (P4)
│   │   └── transient.js         # Bucle en el tiempo (Euler hacia atrás)
│   └── ui/
│       ├── properties.js  (P2)  # Panel para editar valores del componente seleccionado
│       └── results.js     (P4)  # Tablas de resultados y gráficas Chart.js
├── examples/                    # Circuitos JSON con resultado conocido (para pruebas)
└── docs/
    └── ARQUITECTURA.md
```

## 5. Contratos entre módulos

### 5.1 Catálogo de componentes

| `type` | Componente | `value` | Unidad | Terminales |
|---|---|---|---|---|
| `R` | Resistencia | resistencia | Ω | 2 |
| `C` | Capacitor | capacitancia | F | 2 |
| `L` | Inductor | inductancia | H | 2 |
| `V` | Fuente de voltaje DC | voltaje | V | 2 (`n1` = +) |
| `I` | Fuente de corriente DC | corriente | A | 2 (flecha de `n1` hacia `n2`) |
| `VAC` | Fuente de voltaje AC | amplitud (+ `phase` en grados) | V | 2 (`n1` = +) |
| `GND` | Tierra | — | — | 1 |

### 5.2 CircuitModel — lo que produce el editor (P1 → P2)

Representa **el dibujo**: posiciones en la cuadrícula, no nodos eléctricos.

```js
{
  components: [
    { id: "R1", type: "R", value: 1000, x: 200, y: 100, rotation: 0,
      terminals: [ { x: 180, y: 100 }, { x: 220, y: 100 } ] },
    { id: "GND1", type: "GND", x: 100, y: 300, rotation: 0,
      terminals: [ { x: 100, y: 280 } ] }
  ],
  wires: [
    { id: "W1", from: { x: 220, y: 100 }, to: { x: 300, y: 100 } }
  ]
}
```

Regla: dos puntos son el **mismo nodo eléctrico** si tienen las mismas coordenadas (por eso todo se ajusta a la cuadrícula).

### 5.3 Netlist — lo que consume el motor (P2 → P3/P4)

```js
{
  nodeCount: 3,                 // nodos 0..2; el 0 es SIEMPRE tierra
  components: [
    { id: "V1", type: "V", n1: 1, n2: 0, value: 12 },
    { id: "R1", type: "R", n1: 1, n2: 2, value: 1000 },
    { id: "C1", type: "C", n1: 2, n2: 0, value: 1e-6 }
  ]
}
```

- Los componentes `GND` **no** aparecen en la netlist; solo sirven para saber qué nodo es el 0.
- `value` siempre va en unidades SI (ya convertido: 4.7k → 4700).

### 5.4 Resultados (P3/P4 → UI)

```js
// DC
{ mode: "dc",
  nodeVoltages: [0, 12, 5.3],                 // índice = número de nodo
  currents: { V1: -0.0067, R1: 0.0067 } }     // sentido: de n1 hacia n2

// AC (valores complejos: magnitud y fase en grados)
{ mode: "ac", frequency: 60,
  nodeVoltages: [ {mag: 0, phase: 0}, {mag: 10, phase: 0}, {mag: 7.1, phase: -45} ],
  currents: { R1: {mag: 0.0071, phase: 45} } }

// Transitorio
{ mode: "transient",
  time: [0, 1e-5, 2e-5, ...],
  nodeVoltages: [ [0,0,...], [12,12,...], [0, 0.12, ...] ],   // [nodo][paso]
  currents: { R1: [0.012, 0.0119, ...] } }
```

### 5.5 Convención de signos

- Corriente **positiva** = fluye de `n1` hacia `n2` *por dentro* del componente.
- Voltaje del componente = `V(n1) − V(n2)`.
- Potencia = voltaje × corriente. **Positiva = el componente absorbe** energía; **negativa = la entrega**. En todo circuito la suma de potencias debe dar 0 (sirve para verificar el motor).
- Fuente de voltaje: `n1` es el terminal **+**. Una fuente que entrega potencia queda con corriente negativa (estándar SPICE).
- Fuente de corriente: entrega `value` amperios que circulan por dentro de la fuente de `n1` hacia `n2` (la flecha del símbolo apunta a `n2`).
- En DC, la fuente `VAC` se trata como 0 V (su valor promedio), es decir, como un cortocircuito.

## 6. Motor de cálculo (resumen técnico)

**Análisis Nodal Modificado (MNA):** se arma `A · x = b`, donde `x` tiene los voltajes de los nodos 1..N y las corrientes de las fuentes de voltaje (e inductores en DC). Cada componente "estampa" su aporte en la matriz:

| Componente | DC | AC (ω = 2πf) | Transitorio (paso Δt) |
|---|---|---|---|
| R | conductancia `1/R` | `1/R` | `1/R` |
| C | abierto (no aporta) | admitancia `jωC` | conductancia `C/Δt` + fuente de corriente `(C/Δt)·v_anterior` |
| L | cortocircuito (fuente de 0 V) | admitancia `1/(jωL)` | conductancia `Δt/L` + fuente de corriente `i_anterior` |
| V / VAC | fila extra en la matriz | fila extra (fasor) | fila extra |
| I | término en `b` | término en `b` | término en `b` |

**Robustez:** se agrega una conductancia minúscula (`GMIN = 1e-12 S`) de cada nodo a tierra para que un nodo conectado solo por un capacitor no deje la matriz singular (sin solución).

**Validación del transitorio:** comparar con la solución analítica de la EDO. Ej.: circuito RC serie con fuente V → `v_C(t) = V·(1 − e^(−t/RC))`.

## 7. Reparto del trabajo

| Integrante | Módulo | Entregable verificable |
|---|---|---|
| **P1** | Editor visual (`js/editor/`) | Colocar, mover, rotar, borrar componentes y dibujar cables; exporta un `CircuitModel` válido |
| **P2** | Modelo, netlist y propiedades (`js/model/`, `ui/properties.js`) | `CircuitModel → Netlist` correcto para los circuitos de `examples/`; guardar/cargar JSON |
| **P3** | Motor DC y AC (`js/solver/`) | Resultados que coinciden con ejercicios resueltos a mano |
| **P4** | Transitorio y resultados (`js/transient/`, `ui/results.js`) | Curvas RC/RL que coinciden con la solución analítica; tablas y gráficas |

`main.js` e `index.html` se integran entre todos.

## 8. Flujo de trabajo con Git

- `main` siempre funciona. **Nadie hace push directo a `main`.**
- Una rama por tarea: `feature/editor-arrastre`, `feature/solver-dc`, `fix/netlist-nodos`…
- Se integra por **Pull Request** con al menos 1 revisión de otro integrante.
- Commits en español, en imperativo y con prefijo: `feat: agrega rotación de componentes`, `fix: corrige signo de corriente en fuentes`, `docs: …`.
- Antes de empezar el día: `git pull origin main` y actualizar la rama propia.

## 9. Plan por fases

| Fase | Meta | Resultado visible |
|---|---|---|
| 0 | Repo + arquitectura acordada | Este documento aprobado por los 4 |
| 1 | Esqueleto de punta a punta | Divisor de voltaje (V + 2R + GND) resuelto en DC, aunque la interfaz sea básica |
| 2 | Editor completo + DC completo | Cualquier circuito resistivo se dibuja y se resuelve |
| 3 | AC | Magnitud y fase en circuitos RLC |
| 4 | Transitorio + gráficas | Curvas de carga/descarga RC y RL |
| 5 | Pulido y validación | Ejemplos, manejo de errores, informe y sustentación |

## 10. Decisiones

### Tomadas

| Decisión | Resultado |
|---|---|
| Fuente de corriente `I` | **Se incluye** desde la fase 1 |
| AC | **Una sola frecuencia**. El barrido (diagrama de Bode) queda como extra si sobra tiempo |
| Mostrar resultados | **Tabla** de nodos y componentes. Mostrar valores sobre el dibujo al pasar el mouse queda para la fase 5 |

### Pendientes

- [ ] ¿Quién toma cada rol (P1–P4)?
- [ ] ¿El profesor exige informe, diagramas UML o pruebas?
