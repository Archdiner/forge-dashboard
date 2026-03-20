FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download textblob corpora needed for sentiment analysis
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('averaged_perceptron_tagger')" 2>/dev/null || true

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
