import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SatellitePreview from '../AssessmentResult/SatellitePreview';

describe('SatellitePreview', () => {
  const originalFetch = global.fetch;
  let container = null;
  let root = null;

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }

    if (container) {
      document.body.removeChild(container);
      container = null;
    }

    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }

    jest.clearAllMocks();
  });

  it('shows a Norgeskart link when the API responds with success=false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'Testfeil' }),
    });

    await act(async () => {
      root.render(
        <SatellitePreview
          imageEndpoint="/api/satellite-image"
          norgeskartUrl="https://norgeskart.example/preview"
          coordinates={{ lat: 59.9139, lon: 10.7522 }}
        />
      );
    });

    // Allow pending promises to resolve
    await act(async () => {
      await Promise.resolve();
    });

    const link = container.querySelector('a[href="https://norgeskart.example/preview"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/åpne i norgeskart/i);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/satellite-image'),
      expect.objectContaining({ method: 'GET' })
    );
  });
});
