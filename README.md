# clinical-quality-analytics
Clinical Quality  analytics

## Getting Started

Clone the repository and start the application from the `assessment` directory, where the Docker Compose file lives.

```bash
git clone https://github.com/siddharthasaha/clinical-quality-analytics.git
cd clinical-quality-analytics/assessment
docker compose up --build
```

After startup completes:

- Frontend: `http://localhost:5173`
- API health check: `http://localhost:3000/health`

The database seed can take a few minutes on the first run, so wait for the containers to finish initializing before testing the app.

## AI Tool Usage

AI-assisted tools (GPT5.4,Claude Sonnet 4.6) were used to:

- Generate initial drafts of documentation (performance baseline, optimization plan)
- Suggest query optimizations and schema design improvements
- Assist in structuring test cases and CI configuration

All outputs were reviewed, validated, and tested against the actual system before inclusion.