/**
 * Location data is intentionally just data — no application code branches on
 * city names — so new cities/areas/countries can be added later purely by
 * editing this file (or, in production, by reading a `locations` Firestore
 * collection) without touching screens or services.
 */
export interface CityDefinition {
  id: string;
  name: string;
  province: string;
  areas: string[];
}

export const ZAMBIA_CITIES: CityDefinition[] = [
  {
    id: "lusaka",
    name: "Lusaka",
    province: "Lusaka Province",
    areas: [
      "Chalala", "Kabulonga", "Woodlands", "Roma", "Ibex Hill", "Chelston",
      "Avondale", "Longacres", "Rhodes Park", "Meanwood", "Chilenje",
      "Kabwata", "Olympia", "Salama Park", "Chamba Valley", "Silverest",
      "Makeni", "Waterfalls", "Bauleni", "Garden City",
    ],
  },
  { id: "kitwe", name: "Kitwe", province: "Copperbelt Province", areas: ["Riverside", "Parklands", "Nkana East", "Kwacha", "Chimwemwe"] },
  { id: "ndola", name: "Ndola", province: "Copperbelt Province", areas: ["Northrise", "Kansenshi", "Itawa", "Chifubu", "Kaniki"] },
  { id: "livingstone", name: "Livingstone", province: "Southern Province", areas: ["Maramba", "Dambwa", "Libuyu", "Nakatindi"] },
  { id: "kabwe", name: "Kabwe", province: "Central Province", areas: ["Katondo", "Kasanda", "Highridge"] },
  { id: "chingola", name: "Chingola", province: "Copperbelt Province", areas: ["Nchanga North", "Kabundi", "Chiwempala"] },
  { id: "mufulira", name: "Mufulira", province: "Copperbelt Province", areas: ["Kankoyo", "Kamuchanga", "Central"] },
  { id: "chipata", name: "Chipata", province: "Eastern Province", areas: ["Kapata", "Chipangali", "Ngwerere"] },
];

export const DEFAULT_CITY_ID = "lusaka";

export function getCity(id: string): CityDefinition | undefined {
  return ZAMBIA_CITIES.find((c) => c.id === id);
}
