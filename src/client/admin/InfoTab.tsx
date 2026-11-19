import { useRef, useState } from 'react';
import { LIMITS } from '../../shared/defaults';
import { deleteVenueMap, uploadVenueMap, venueMapUrl } from '../api';
import { TextAreaField, TextField, type TabProps } from './common';

/** Longest side of the uploaded venue map; larger photos are scaled down in the browser. */
const MAP_MAX_SIZE = 2000;

/** Information for the teams: house rules, where the tables are, venue map. */
export function InfoTab({ state, run }: TabProps) {
  const { settings } = state;
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapUrl = venueMapUrl(settings.venueMapVersion);

  const upload = async (file: File): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      await uploadVenueMap(await shrinkImage(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a-stack">
      <section className="card">
        <h2>Regeln</h2>
        <p className="muted small">
          Erscheint auf den Handys der Teams im Reiter „Infos“. Zeilenumbrüche bleiben erhalten.
        </p>
        <TextAreaField
          rows={12}
          maxLength={LIMITS.maxRulesLength}
          value={settings.rules}
          placeholder={'z. B.\n- 6 Becher pro Team, Pyramide 3-2-1\n- Ellbogen hinter der Tischkante\n- Bounce zählt 2 Becher\n- Nachwurf bei letztem Becher'}
          onCommit={(rules) => void run({ type: 'updateSettings', patch: { rules } })}
        />
      </section>

      <section className="card">
        <h2>Wo steht welcher Tisch?</h2>
        <div className="table-places">
          {settings.tableNames.map((name, index) => (
            <label key={index}>
              <span>{name}</span>
              <TextField
                value={settings.tableDescriptions[index] ?? ''}
                maxLength={LIMITS.maxTableDescriptionLength}
                placeholder="z. B. Garage, links neben dem Tor"
                onCommit={(value) =>
                  void run({
                    type: 'updateSettings',
                    patch: {
                      tableDescriptions: settings.tableNames.map((_, i) =>
                        i === index ? value : (settings.tableDescriptions[i] ?? ''),
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="muted small">
          Die Beschreibung steht bei jedem Spiel auf den Handys unter dem Tischnamen. Die Namen der
          Tische änderst du im Reiter „Format“.
        </p>

        <h3>Tischplan (Bild)</h3>
        <p className="muted small">
          Ein Foto oder eine Skizze des Geländes, z. B. ein Handyfoto einer Zeichnung. Große Bilder
          werden vor dem Hochladen verkleinert.
        </p>
        {mapUrl && <img className="venue-map" src={mapUrl} alt="Tischplan" />}
        <div className="row wrap">
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Lade hoch …' : mapUrl ? 'Anderes Bild wählen …' : 'Bild hochladen …'}
          </button>
          {mapUrl && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Tischplan entfernen?')) {
                  deleteVenueMap().catch((error: unknown) =>
                    setMessage(error instanceof Error ? error.message : 'Fehler'),
                  );
                }
              }}
            >
              Entfernen
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
        </div>
        {message && <p className="note warn">{message}</p>}
      </section>
    </div>
  );
}

/**
 * Re-encodes the image as JPEG with at most MAP_MAX_SIZE pixels on the long
 * side. This also converts formats the server does not accept (e.g. HEIC
 * photos from an iPhone, as far as the browser can decode them).
 */
async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Dieses Bild kann der Browser nicht lesen. Bitte als JPEG oder PNG speichern.');
  }
  const scale = Math.min(1, MAP_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Bild konnte nicht verarbeitet werden.');
  context.fillStyle = '#fff'; // transparent PNGs would turn black in JPEG
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.'))),
      'image/jpeg',
      0.85,
    );
  });
}
