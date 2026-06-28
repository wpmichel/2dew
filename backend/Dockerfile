# Multi-stage build for the ASP.NET Core API.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend.csproj ./
RUN dotnet restore

COPY . ./
# Skip OpenAPI document emission in the image; it is only needed for local type generation.
RUN dotnet publish backend.csproj -c Release -o /app -p:OpenApiGenerateDocumentsOnBuild=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./

# Schema is created on startup; the SQLite file lives on a mounted volume so data persists.
RUN mkdir -p /data
ENV ASPNETCORE_URLS=http://+:8080
ENV ConnectionStrings__Default="Data Source=/data/app.db"
EXPOSE 8080

ENTRYPOINT ["dotnet", "backend.dll"]
