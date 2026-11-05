import type { CoordinateTransformer } from '../engine/CoordinateTransformer';
import type { Overlay } from '../engine/OverlayManager';
import type { DataStore } from '../store/DataStore';

/**
 * The inline text editor for drawings, and the image picker for image
 * annotations. DOM interaction that only needs to place itself over the plot
 * and tell the chart when an overlay changed, so it sits with the other GUI
 * widgets rather than in the chart.
 */
export interface OverlayTextEditorHost {
  /** The chart's container; the editor is placed inside it. */
  container(): HTMLElement;
  transformer(): CoordinateTransformer;
  dataStore(): DataStore;
  /** The plot's top-left corner within the container. */
  plotOrigin(): { left: number; top: number };
  fontFamily(): string;
  /** An overlay's text or image changed: redraw and persist. */
  overlayChanged(): void;
}

/** Let the user pick an image file of 300 KB or less, and decode it. */
export function pickImageFile(
onDecoded: (dataUrl: string, img: HTMLImageElement) => void,
): void {
  if (typeof document === 'undefined') return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) {
      fileInput.remove();
      return;
    }

    const MAX_BYTES = 300 * 1024;
    if (file.size > MAX_BYTES) {
      alert(
        `Image is ${(file.size / 1024).toFixed(1)} KB, over the 300 KB limit. ` +
          'Choose an image of 300 KB or less.',
      );
      fileInput.remove();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => onDecoded(dataUrl, img);
      img.src = dataUrl;
      fileInput.remove();
    };
    reader.readAsDataURL(file);
  };

  document.body.appendChild(fileInput);
  fileInput.click();
}

/** Edit an overlay's text in place, or replace an image annotation's picture. */
export function openOverlayTextEditor(host: OverlayTextEditorHost, overlay: Overlay): void {
  if (typeof document === 'undefined') return;

  if (overlay.annotation?.kind === 'image') {
    // Replace the annotation's image through the shared picker (300 KB cap).
    pickImageFile((dataUrl, img) => {
      overlay.imageUrl = dataUrl;
      overlay._imageCache = img;
      host.overlayChanged();
    });
    return;
  }

  // Remove any existing active inline editor
  const container = host.container();
  const existing = container.querySelector('.fusion-overlay-inline-editor');
  if (existing) existing.remove();

  const transformer = host.transformer();
  const dataStore = host.dataStore();
  const isTag = overlay.annotation?.kind === 'tag';
  const isArrow = overlay.annotation?.kind === 'arrow';

  let targetX = 0;
  let targetY = 0;

  if (overlay.points.length >= 2) {
    targetX = transformer.timestampToXUnbounded(overlay.points[1].timestamp, dataStore);
    targetY = transformer.priceToY(overlay.points[1].value);
  } else if (overlay.points.length >= 1) {
    targetX = transformer.timestampToXUnbounded(overlay.points[0].timestamp, dataStore);
    targetY = transformer.priceToY(overlay.points[0].value) + (isTag ? -28 : isArrow ? 24 : 0);
  }

  const origin = host.plotOrigin();
  const screenLeft = targetX + origin.left;
  const screenTop = targetY + origin.top;

  const input = document.createElement('input');
  input.className = 'fusion-overlay-inline-editor';
  input.type = 'text';
  input.value = overlay.text || (isTag && overlay.points[0] ? overlay.points[0].value.toFixed(2) : isArrow ? 'Signal' : 'Text');

  Object.assign(input.style, {
    position: 'absolute',
    left: `${screenLeft}px`,
    top: `${screenTop}px`,
    transform: 'translate(-50%, -50%)',
    zIndex: '99999',
    background: overlay.color || '#2962ff',
    color: '#ffffff',
    font: `600 12px ${host.fontFamily()}`,
    padding: '4px 10px',
    border: '2px solid rgba(255, 255, 255, 0.95)',
    borderRadius: '4px',
    outline: 'none',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    minWidth: '60px',
    maxWidth: '240px',
    cursor: 'text',
    pointerEvents: 'auto',
  });

  input.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
  });

  input.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
  });

  input.addEventListener('dblclick', (e: MouseEvent) => {
    e.stopPropagation();
  });

  let isCommitted = false;
  const commit = () => {
    if (isCommitted) return;
    isCommitted = true;
    const nextText = input.value.trim();
    if (nextText !== '') {
      overlay.text = nextText;
    }
    if (input.parentNode) {
      input.remove();
    }
    host.overlayChanged();
  };

  const cancel = () => {
    if (isCommitted) return;
    isCommitted = true;
    if (input.parentNode) {
      input.remove();
    }
  };

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', commit);
  container.appendChild(input);
  requestAnimationFrame(() => {
    // The editor can be gone by the next frame: committed, cancelled, or the
    // chart destroyed. Focusing a detached input would do nothing useful.
    if (!input.isConnected) return;
    input.focus();
    input.select();
  });
}
