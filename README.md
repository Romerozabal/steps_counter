# Contador de pasos

Servidor web local en **Node.js** (sin dependencias) para contar pasos durante
ensayos de marcha. Sirve una página pensada para el móvil con dos botones
grandes (pierna izquierda / pierna derecha). Cada pulsación se guarda con la
**hora del ordenador** (no la del móvil) y bajo el nombre de la sesión activa.
Los datos se pueden exportar a CSV.

## Uso

```bash
node contador-pasos.js
```

Luego, desde el móvil (en la misma red wifi que el ordenador):

```
http://IP-DEL-ORDENADOR:3000
```

El puerto se puede cambiar con la variable de entorno `PORT`.

## Archivos

| Archivo | Descripción |
|---|---|
| `contador-pasos.js` | Aplicación principal (servidor web). |
| `pasos.json` | Datos persistidos (sesiones y pulsaciones). |
| `pasos.backup-antes-de-unir.json` | Copia de seguridad previa a una fusión de datos. |
| `exportar-todo-csv.js` | Exporta todas las sesiones a CSV. |
| `generar-figura.js` | Genera una figura a partir de los datos. |
| `figura-Marcha_t1.html` | Figura de marcha generada. |
