import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Globe, Flag, Building2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedRequest } from "@/lib/auth";

interface Country {
  id: number;
  name: string;
  iso2: string;
  iso3: string;
}

interface State {
  id: number;
  name: string;
  country_id: number;
  iso2: string;
}

interface City {
  id: string;
  name: string;
  state_id: string;
}

interface LocationSelectorProps {
  country?: string;
  state?: string;
  city?: string;
  onLocationChange: (location: { country?: string; state?: string; city?: string }) => void;
  dataTestId?: string;
}

export function LocationSelector({ 
  country, 
  state, 
  city, 
  onLocationChange,
  dataTestId = "location-selector"
}: LocationSelectorProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedState, setSelectedState] = useState<State | null>(null);
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  // Load countries on mount
  useEffect(() => {
    const loadCountries = async () => {
      try {
        setIsLoadingCountries(true);
        const response = await authenticatedRequest('GET', '/api/geographic/countries');
        const countriesData = await response.json();
        setCountries(countriesData);
      } catch (error) {
        console.error('Failed to load countries:', error);
      } finally {
        setIsLoadingCountries(false);
      }
    };

    loadCountries();
  }, []);
  
  // Update selected country when country prop changes
  useEffect(() => {
    if (country && countries.length > 0) {
      const foundCountry = countries.find((c: Country) => c.name === country);
      if (foundCountry && foundCountry.id !== selectedCountry?.id) {
        setSelectedCountry(foundCountry);
      }
    }
  }, [country, countries]);

  // Load states when country changes
  useEffect(() => {
    const loadStates = async () => {
      if (!selectedCountry) {
        setStates([]);
        setSelectedState(null);
        return;
      }

      try {
        setIsLoadingStates(true);
        const response = await authenticatedRequest('GET', `/api/geographic/states?countryId=${selectedCountry.id}`);
        const countryStates = await response.json();
        setStates(countryStates);
      } catch (error) {
        console.error('Failed to load states:', error);
        setStates([]);
      } finally {
        setIsLoadingStates(false);
      }
    };

    loadStates();
  }, [selectedCountry]);
  
  // Update selected state when state prop changes
  useEffect(() => {
    if (state && states.length > 0) {
      const foundState = states.find((s: State) => s.name === state);
      if (foundState && foundState.id !== selectedState?.id) {
        setSelectedState(foundState);
      }
    }
  }, [state, states]);

  // Load cities when state changes
  useEffect(() => {
    const loadCities = async () => {
      if (!selectedState) {
        setCities([]);
        return;
      }

      try {
        setIsLoadingCities(true);
        const response = await authenticatedRequest('GET', `/api/geographic/cities?stateId=${selectedState.id}`);
        const stateCities = await response.json();
        setCities(stateCities);
      } catch (error) {
        console.error('Failed to load cities:', error);
        setCities([]);
      } finally {
        setIsLoadingCities(false);
      }
    };

    loadCities();
  }, [selectedState]);

  // Initialize selected state from props
  useEffect(() => {
    if (state && states.length > 0) {
      const foundState = states.find(s => s.name === state);
      if (foundState) {
        setSelectedState(foundState);
      }
    }
  }, [state, states]);

  const handleCountryChange = (countryName: string) => {
    const foundCountry = countries.find(c => c.name === countryName);
    setSelectedCountry(foundCountry || null);
    setSelectedState(null); // Reset state selection
    
    // Reset state and city when country changes
    onLocationChange({
      country: countryName,
      state: undefined,
      city: undefined
    });
  };

  const handleStateChange = (stateName: string) => {
    const foundState = states.find(s => s.name === stateName);
    setSelectedState(foundState || null);
    
    // Reset city when state changes
    onLocationChange({
      country: selectedCountry?.name,
      state: stateName,
      city: undefined
    });
  };

  const handleCityChange = (cityName: string) => {
    onLocationChange({
      country: selectedCountry?.name,
      state: selectedState?.name,
      city: cityName
    });
  };

  const clearLocation = () => {
    setSelectedCountry(null);
    setSelectedState(null);
    setCities([]);
    onLocationChange({
      country: undefined,
      state: undefined,
      city: undefined
    });
  };

  return (
    <div className="space-y-4" data-testid={dataTestId}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Location
        </Label>
        {(country || state || city) && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearLocation}
            data-testid="button-clear-location"
          >
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Country Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="h-3 w-3" />
              Country
            </Label>
            <Select 
              value={country || ""} 
              onValueChange={handleCountryChange}
              disabled={isLoadingCountries}
            >
              <SelectTrigger data-testid="select-country">
                <SelectValue placeholder={isLoadingCountries ? "Loading countries..." : "Select country"} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    <div className="flex items-center gap-2">
                      <Flag className="h-3 w-3" />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* State Selection */}
          {selectedCountry && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-sm text-muted-foreground">
                <Building2 className="h-3 w-3" />
                State/Province
              </Label>
              <Select 
                value={state || ""} 
                onValueChange={handleStateChange}
                disabled={isLoadingStates || states.length === 0}
              >
                <SelectTrigger data-testid="select-state">
                  <SelectValue placeholder={
                    isLoadingStates ? "Loading states..." : 
                    states.length === 0 ? "No states available" :
                    "Select state/province"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* City Selection - Searchable combobox with all cities */}
          {selectedState && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                City/Location {cities.length > 0 && <span className="text-xs opacity-70">({cities.length} cities)</span>}
              </Label>
              <Popover modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    disabled={isLoadingCities || cities.length === 0}
                    className={cn(
                      "w-full justify-between font-normal",
                      !city && "text-muted-foreground"
                    )}
                    data-testid="select-city"
                  >
                    {city || (isLoadingCities ? "Loading cities..." : 
                      cities.length === 0 ? "No cities available" :
                      `Search ${cities.length} cities...`)}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search city..." />
                    <CommandEmpty>No city found.</CommandEmpty>
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      {/* Workaround: manually update scrollTop on wheel */}
                      {cities.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={(currentValue) => {
                            handleCityChange(currentValue === city ? "" : currentValue);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              city === c.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {c.name}
                        </CommandItem>
                      ))}
                      <script dangerouslySetInnerHTML={{__html:`
                        document.querySelectorAll('[cmdk-list]').forEach(function(list){
                          list.addEventListener('wheel', function(e){
                            if (e.deltaY !== 0) {
                              list.scrollTop += e.deltaY;
                            }
                          });
                        });
                      `}} />
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Display Current Selection */}
          {(country || state || city) && (
            <div className="mt-3 p-2 bg-muted rounded text-sm">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <MapPin className="h-3 w-3" />
                Selected Location:
              </div>
              <div className="font-medium">
                {[city, state, country].filter(Boolean).join(', ') || 'None selected'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}