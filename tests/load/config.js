package k6

import (
	"fmt"
	"time"
)

// K6 configuration for Nexus CRM load testing
type Config struct {
	BaseURL    string        `json:"base_url"`
	Duration   time.Duration `json:"duration"`
	VUs        int           `json:"vus"`
	RampUp     time.Duration `json:"ramp_up"`
	RampDown   time.Duration `json:"ramp_down"`
	Thresholds map[string][]string `json:"thresholds"`
}

// Default configuration
var DefaultConfig = Config{
	BaseURL:  "http://localhost:8000",
	Duration: 10 * time.Minute,
	VUs:      100,
	RampUp:   2 * time.Minute,
	RampDown: 2 * time.Minute,
	Thresholds: map[string][]string{
		"http_req_duration": {"p(95)<500"},
		"http_req_failed":   {"rate<0.1"},
	},
}

// Validate configuration
func (c *Config) Validate() error {
	if c.BaseURL == "" {
		return fmt.Errorf("base_url is required")
	}
	if c.VUs <= 0 {
		return fmt.Errorf("vus must be greater than 0")
	}
	if c.Duration <= 0 {
		return fmt.Errorf("duration must be greater than 0")
	}
	return nil
}