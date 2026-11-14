import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR code of a link, rendered locally (no external service). */
export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(text, { margin: 1, width: size })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [text, size]);
  return src ? <img className="qr" src={src} alt={`QR-Code für ${text}`} /> : <div className="qr" />;
}
