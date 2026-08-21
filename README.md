# MovieVerse - Full Stack Movie Discovery Web Application

[![Java](https://img.shields.io/badge/Java-17%2F21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2.3-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Spring Data JPA](https://img.shields.io/badge/Spring_Data_JPA-Hibernate-59666C?style=for-the-badge&logo=hibernate&logoColor=white)](https://spring.io/projects/spring-data-jpa)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)](https://getbootstrap.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**MovieVerse** is a modern, responsive full-stack movie discovery web application crafted for movie lovers. It allows users to search titles, browse movies across multiple genres (Action, Sci-Fi, Drama, Comedy, Horror, Romance), view rich movie metadata, manage personalized favourites watchlists, and authenticate securely using BCrypt password hashing.

Designed specifically to serve as a **capstone portfolio project for CDAC graduates and Java Full Stack Developer interviews**.

---

## 🚀 Key Features

* 🔍 **Instant Search:** Real-time multi-field search covering movie title, director, cast members, and genres.
* 🏷️ **Multi-Genre Filter:** Interactive filter pills for Action, Sci-Fi, Drama, Comedy, Crime, Fantasy, and Animation.
* 🎬 **Spotlight Hero Carousel:** Featured blockbuster carousel with ratings, badges, and quick detail navigation.
* 📄 **Movie Details View:** Full synopsis, director, complete star cast list, release date, duration, country, language, and high-res backdrop imagery.
* ❤️ **User Favourites / Watchlist:** Add or remove movies to personalized watchlists with instant status sync.
* 🔐 **Authentication & Security:** User registration and sign-in with **BCrypt cryptographic password hashing** (never stored in plaintext).
* 📱 **Mobile-Responsive Cinematic UI:** Dark cinematic Netflix-style theme built with Bootstrap 5, semantic HTML5, and CSS3.
* 🏛️ **Clean Layered Architecture:** Strict separation of concerns (Controller, Service, Repository, Entity, DTO, Global Exception Handler).

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Backend Framework** | Java 17/21, Spring Boot 3.2.3, Spring MVC (REST APIs) |
| **Persistence / ORM** | Spring Data JPA, Hibernate, HikariCP Connection Pool |
| **Database** | MySQL 8.0+ / MariaDB |
| **Security & Crypto** | Spring Security Crypto (`BCryptPasswordEncoder`) |
| **Validation** | Jakarta Bean Validation (`@Valid`, `@NotBlank`, `@Email`) |
| **Frontend UI** | HTML5, CSS3 (Dark Theme), Bootstrap 5.3.3, Bootstrap Icons |
| **Client Scripting** | Vanilla JavaScript (ES6+ `fetch` API, Async/Await, LocalStorage) |
| **Build Tool** | Apache Maven 3.8+ |

---

## 📂 Project Directory Structure

```
MovieVerse/
├── pom.xml                                    # Maven dependencies & build configuration
├── README.md                                  # Complete project documentation
└── src/
    └── main/
        ├── java/com/movieverse/
        │   ├── MovieVerseApplication.java     # Spring Boot Main Application class
        │   ├── config/
        │   │   ├── SecurityConfig.java        # BCrypt PasswordEncoder Bean Configuration
        │   │   └── WebConfig.java             # CORS & Static Resource Handlers
        │   ├── controller/
        │   │   ├── AuthController.java        # /api/auth/register & /api/auth/login
        │   │   ├── MovieController.java       # /api/movies CRUD, search, genre filter
        │   │   └── FavouriteController.java   # /api/favourites add/get/remove
        │   ├── service/
        │   │   ├── UserService.java           # Auth logic, duplicate check, password hashing
        │   │   ├── MovieService.java          # Search, sorting, query filters
        │   │   └── FavouriteService.java      # User favourites management
        │   ├── repository/
        │   │   ├── UserRepository.java        # Spring Data JPA User Repository
        │   │   ├── MovieRepository.java       # Spring Data JPA Movie Repository with JPQL
        │   │   └── FavouriteRepository.java   # Spring Data JPA Favourite Repository
        │   ├── entity/
        │   │   ├── User.java                  # JPA Entity: users table
        │   │   ├── Movie.java                 # JPA Entity: movies table
        │   │   └── Favourite.java             # JPA Entity: favourites junction table
        │   ├── dto/
        │   │   ├── RegisterRequest.java       # User registration DTO with validation
        │   │   ├── LoginRequest.java          # User login credentials DTO
        │   │   ├── UserResponse.java          # Safe user response DTO (no password hash)
        │   │   ├── FavouriteRequest.java      # Add-to-favourite payload DTO
        │   │   └── ApiResponse.java           # Standard API response wrapper
        │   └── exception/
        │       ├── ResourceNotFoundException.java # HTTP 404 handler
        │       ├── BadRequestException.java       # HTTP 400 handler
        │       └── GlobalExceptionHandler.java    # @RestControllerAdvice
        └── resources/
            ├── application.properties         # DB connection & server port setup
            ├── schema.sql                     # MySQL Table Definitions (DDL)
            ├── data.sql                       # 18+ Blockbuster Movies & Seed Users (DML)
            └── static/
                ├── index.html                 # Homepage with Carousel & Sections
                ├── movies.html                # Movies Catalog & Genre Filter
                ├── movie-details.html         # Rich Movie Info & Cast View
                ├── favourites.html            # User Watchlist Page
                ├── login.html                 # Login Page
                ├── register.html              # Registration Page
                ├── about.html                 # About Platform & Stack
                ├── architecture.html          # In-app Java Architecture & Interview Guide
                ├── css/
                │   └── style.css              # Custom Dark Cinematic CSS
                └── js/
                    └── app.js                 # Frontend REST Client & UI Engine
```

---

## 🗄️ Database Schema (MySQL)

### 1. `users` Table
```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- BCrypt Hash
    role VARCHAR(20) DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `movies` Table
```sql
CREATE TABLE movies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    genre VARCHAR(150) NOT NULL,
    rating DECIMAL(3, 1) NOT NULL,
    release_date VARCHAR(30),
    duration VARCHAR(50),
    language VARCHAR(100),
    country VARCHAR(100),
    director VARCHAR(150),
    cast TEXT,
    poster_url VARCHAR(500),
    backdrop_url VARCHAR(500),
    is_popular BOOLEAN DEFAULT FALSE,
    is_latest BOOLEAN DEFAULT FALSE,
    is_trending BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. `favourites` Table
```sql
CREATE TABLE favourites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    movie_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_fav_movie FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_movie UNIQUE (user_id, movie_id)
);
```

---

## ⚡ How to Setup and Run

### Prerequisites
1. **Java Development Kit (JDK):** Version 17 or 21 ([Download JDK](https://www.oracle.com/java/technologies/downloads/))
2. **Apache Maven:** Version 3.8+ (`mvn -v`)
3. **MySQL Server:** Version 8.0+ running on port `3306`

---

### Step 1: Clone the Repository & Setup MySQL Database

1. Open your MySQL Command Line Client or MySQL Workbench:
```sql
CREATE DATABASE IF NOT EXISTS movieverse_db;
```

2. Open `src/main/resources/application.properties` and update your MySQL username and password:
```properties
spring.datasource.url=jdbc:mysql://localhost:3306/movieverse_db?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true
spring.datasource.username=root
spring.datasource.password=YOUR_MYSQL_PASSWORD
```

---

### Step 2: Running via Terminal / Maven

```bash
# Navigate to the project root directory
mvn clean install

# Launch Spring Boot Application
mvn spring-boot:run
```

---

### Step 3: Running in IntelliJ IDEA / Eclipse

#### In IntelliJ IDEA:
1. Open IntelliJ IDEA.
2. Select **File** ➔ **Open...** ➔ Select the `MovieVerse` project root directory (or its `pom.xml`).
3. Allow IntelliJ to sync Maven dependencies.
4. Locate `src/main/java/com/movieverse/MovieVerseApplication.java`.
5. Right-click and choose **Run 'MovieVerseApplication'**.

#### In Eclipse / STS:
1. Select **File** ➔ **Import...** ➔ **Existing Maven Projects**.
2. Browse to the project folder and click **Finish**.
3. Right-click the project ➔ **Run As** ➔ **Spring Boot App** (or **Java Application**).

---

### Step 4: Access the Website

Open your browser and visit:
```
http://localhost:8080
```

* **Default Demo User Account:**
  * **Email:** `demo@movieverse.com`
  * **Password:** `password123`

---

## 📡 REST API Documentation

### 🎬 Movies Endpoints
| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/movies` | Get all movies (supports `?title=`, `?genre=`, `?sort=`) |
| `GET` | `/api/movies/{id}` | Get movie details by ID |
| `GET` | `/api/movies/search?title=Avengers` | Search movies by title |
| `GET` | `/api/movies/genre/{genre}` | Filter movies by genre (e.g. `Sci-Fi`, `Action`) |
| `GET` | `/api/movies/popular` | Get top rated / spotlight movies |
| `GET` | `/api/movies/latest` | Get newest release movies |
| `GET` | `/api/movies/trending` | Get trending movies |

### 🔐 Authentication Endpoints
| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user with BCrypt password hashing |
| `POST` | `/api/auth/login` | Authenticate user credentials and return profile |

### ❤️ Favourites Endpoints
| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/favourites` | Add movie to user's favourite list (`userId`, `movieId`) |
| `GET` | `/api/favourites/{userId}` | Retrieve all favourite movies for a given user |
| `DELETE` | `/api/favourites/{userId}/{movieId}` | Remove movie from user's favourites |

---

## 🎓 Java Interview Questions & Architecture Answers

### Q1: Why use Spring Data JPA over standard JDBC?
> **Answer:** Spring Data JPA drastically cuts down boilerplate code. By creating interfaces extending `JpaRepository<T, ID>`, Spring automatically generates CRUD implementations, transaction management, pagination, and derived query parsing (e.g., `findByTitleContainingIgnoreCase`). It handles object-relational mapping without writing manual SQL strings or mapping ResultSet columns.

### Q2: How is password security implemented?
> **Answer:** We use the `BCryptPasswordEncoder` bean from Spring Security Crypto. BCrypt automatically handles salting (preventing rainbow table attacks) and applies an adaptive work factor. Passwords are saved only as one-way 60-character hashes.

### Q3: How is global error handling achieved in Spring Boot?
> **Answer:** Through `@RestControllerAdvice` and `@ExceptionHandler`. Instead of letting unhandled exceptions bubble up to Tomcat and reveal internal stack traces, custom exceptions like `ResourceNotFoundException` and `BadRequestException` are caught and mapped to uniform JSON error structures with appropriate HTTP status codes (404, 400, 500).

---

## 📜 License
This project is open-source and available under the [MIT License](LICENSE).
