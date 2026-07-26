import { Injectable, Logger } from '@nestjs/common';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Géocodage d'adresse texte en coordonnées via Nominatim (OpenStreetMap).
 * Service gratuit sans clé API — un User-Agent explicite est requis par leurs
 * conditions d'utilisation. En cas d'échec (adresse introuvable, service
 * indisponible, etc.), on renvoie null sans jamais bloquer la création/màj
 * de l'événement : la carte affichera simplement un état "non disponible".
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  async geocode(address: string): Promise<GeoPoint | null> {
    if (!address?.trim()) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MyBDE/1.0 (contact@mybde.fr)' },
      });
      if (!response.ok) return null;
      const results: Array<{ lat: string; lon: string }> = await response.json();
      if (!results.length) return null;
      const { lat, lon } = results[0];
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
      return { latitude, longitude };
    } catch (e) {
      this.logger.warn(`Géocodage échoué pour "${address}": ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
}
