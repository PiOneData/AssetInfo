import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import fs from "fs";
import path from "path";

const router = Router();

/**
 * @swagger
 * /api/geographic/countries:
 *   get:
 *     summary: Get list of countries
 *     tags: [Geographic]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Countries retrieved successfully
 */
router.get("/countries", authenticateToken, async (req: Request, res: Response) => {
  try {
    const countriesPath = path.join(process.cwd(), 'server', 'data', 'countries.json');

    if (!fs.existsSync(countriesPath)) {
      return res.status(404).json({ message: "Countries data not found" });
    }

    const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    // Return simplified country list for dropdowns
    const countries = countriesData.map((country: any) => ({
      id: country.id,
      name: country.name,
      iso2: country.iso2,
      iso3: country.iso3
    }));

    res.json(countries);
  } catch (error) {
    console.error('Failed to load countries:', error);
    res.status(500).json({ message: "Failed to fetch countries data" });
  }
});

/**
 * @swagger
 * /api/geographic/states:
 *   get:
 *     summary: Get states by country
 *     tags: [Geographic]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: countryId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: States retrieved successfully
 */
router.get("/states", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { countryId } = req.query;
    if (!countryId) {
      return res.status(400).json({ message: "Country ID is required" });
    }

    const statesPath = path.join(process.cwd(), 'server', 'data', 'states.json');

    if (!fs.existsSync(statesPath)) {
      return res.status(404).json({ message: "States data not found" });
    }

    const statesData = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
    // Filter states by country ID
    const states = statesData
      .filter((state: any) => state.country_id === parseInt(countryId as string))
      .map((state: any) => ({
        id: state.id,
        name: state.name,
        country_id: state.country_id,
        iso2: state.iso2
      }));

    res.json(states);
  } catch (error) {
    console.error('Failed to load states:', error);
    res.status(500).json({ message: "Failed to fetch states data" });
  }
});

/**
 * @swagger
 * /api/geographic/cities:
 *   get:
 *     summary: Get cities by state
 *     tags: [Geographic]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cities retrieved successfully
 */
router.get("/cities", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { stateId } = req.query;
    if (!stateId) {
      return res.status(400).json({ message: "State ID is required" });
    }

    const citiesPath = path.join(process.cwd(), 'server', 'data', 'cities.json');

    if (!fs.existsSync(citiesPath)) {
      return res.status(404).json({ message: "Cities data not found" });
    }

    const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

    // Filter cities by state ID
    const cities = citiesData.cities
      .filter((city: any) => city.state_id === stateId.toString())
      .map((city: any) => ({
        id: city.id,
        name: city.name,
        state_id: city.state_id
      }));

    res.json(cities);
  } catch (error) {
    console.error('Failed to load cities:', error);
    res.status(500).json({ message: "Failed to fetch cities data" });
  }
});

/**
 * @swagger
 * /api/geographic/coordinates:
 *   get:
 *     summary: Get location coordinates for mapping
 *     tags: [Geographic]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coordinates retrieved successfully
 */
router.get("/coordinates", authenticateToken, async (req: Request, res: Response) => {
  try {
    const countriesPath = path.join(process.cwd(), 'server', 'data', 'countries.json');
    const statesPath = path.join(process.cwd(), 'server', 'data', 'states.json');
    const citiesPath = path.join(process.cwd(), 'server', 'data', 'cities.json');

    const coordinates: any = {};

    // Get country coordinates - indexed by country name
    if (fs.existsSync(countriesPath)) {
      const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
      countriesData.forEach((country: any) => {
        if (country.latitude && country.longitude && country.name) {
          // Use country name as key (e.g., "India")
          coordinates[country.name] = {
            lat: parseFloat(country.latitude),
            lng: parseFloat(country.longitude),
            type: 'country'
          };
        }
      });
    }

    // Get state coordinates - indexed by "CountryName,StateName"
    if (fs.existsSync(statesPath)) {
      const statesData = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
      statesData.forEach((state: any) => {
        if (state.latitude && state.longitude && state.name && state.country_name) {
          // Use "CountryName,StateName" as key (e.g., "India,Maharashtra")
          const key = `${state.country_name},${state.name}`;
          coordinates[key] = {
            lat: parseFloat(state.latitude),
            lng: parseFloat(state.longitude),
            type: 'state'
          };
        }
      });
    }

    res.json(coordinates);
  } catch (error) {
    console.error('Failed to load location coordinates:', error);
    res.status(500).json({ message: "Failed to fetch coordinates data" });
  }
});

export default router;
