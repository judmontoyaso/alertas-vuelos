# Alertas de vuelos

Vigila rutas aéreas y avisa por correo o Telegram cuando el precio baja.
Next.js (App Router) en Vercel, precios de Google Flights vía SerpApi, alertas guardadas en Supabase.

## Cómo funciona

Origen y destino se eligen de un catálogo de aeropuertos (códigos IATA con ciudad y país), o como
ciudad con todos sus aeropuertos. Hay dos tipos de alerta:

- **Tengo fechas:** un rango de días para la ida y otro para el regreso. La app busca la
  combinación más barata dentro de los rangos. Cada duración de viaje posible es una búsqueda,
  así que se revisan 3 por día, rotando.
- **Cualquier fecha:** solo origen y destino. Busca las fechas más baratas de los próximos seis
  meses (o de un mes concreto) para un viaje de fin de semana, una o dos semanas.

El precio tope es opcional. El formulario puede consultar el precio de hoy y sugerir topes a
partir del rango habitual y el historial que publica Google Flights. Sin tope, la alerta avisa
cuando el precio baja del rango habitual de la ruta.

Un Cron Job de Vercel llama a `/api/check-prices` una vez al día (12:00 UTC, 7:00 a. m. en
Colombia). El aviso solo se repite si el precio baja otro 2 % o pasa una semana.

Google Flights no publica precios de algunas aerolíneas regionales (por ejemplo Satena); esas
rutas no se pueden vigilar y la alerta lo indica.

## Configuración

1. En Supabase, ejecuta `supabase/schema.sql` en el SQL Editor y expón el esquema `vuelo`
   (Project Settings, Data API, Exposed schemas).
2. En Vercel (Settings, Environment Variables) agrega las variables de `.env.example`.
   `ACCESS_TOKEN`, `CRON_SECRET`, `SERPAPI_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
   son obligatorias; Resend y Telegram son opcionales, pero hace falta al menos uno para recibir avisos.
3. Despliega a producción (`npx vercel --prod`). El cron solo corre en producción.

## Catálogo de aeropuertos

`lib/airports.json` se genera con `node scripts/build-airports.mjs ruta/a/airports.csv` a partir
de [OurAirports](https://ourairports.com/data/) (dominio público): aeropuertos con código IATA y
servicio regular.

## Desarrollo local

```bash
cp .env.example .env.local   # y completa los valores
npm run dev
```

Para probar el cron a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/check-prices
```
