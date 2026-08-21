package com.movieverse.controller;

import com.movieverse.entity.Movie;
import com.movieverse.service.MovieService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * MovieController - REST Controller for movie retrieval, search, and filtering.
 * Base Path: /api/movies
 */
@RestController
@RequestMapping("/api/movies")
@CrossOrigin(origins = "*")
public class MovieController {

    private final MovieService movieService;

    @Autowired
    public MovieController(MovieService movieService) {
        this.movieService = movieService;
    }

    /**
     * GET /api/movies - Get all movies, with optional query filters (title, genre, sort).
     */
    @GetMapping
    public ResponseEntity<List<Movie>> getAllMovies(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String genre,
            @RequestParam(required = false) String sort) {
        if (title != null || genre != null || sort != null) {
            return ResponseEntity.ok(movieService.filterAndSortMovies(title, genre, sort));
        }
        return ResponseEntity.ok(movieService.getAllMovies());
    }

    /**
     * GET /api/movies/{id} - Get movie details by primary key ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<Movie> getMovieById(@PathVariable Long id) {
        return ResponseEntity.ok(movieService.getMovieById(id));
    }

    /**
     * GET /api/movies/search?title=Avengers - Search movies matching title keyword.
     */
    @GetMapping("/search")
    public ResponseEntity<List<Movie>> searchMovies(@RequestParam(defaultValue = "") String title) {
        return ResponseEntity.ok(movieService.searchMovies(title));
    }

    /**
     * GET /api/movies/genre/{genre} - Filter movies by specific genre.
     */
    @GetMapping("/genre/{genre}")
    public ResponseEntity<List<Movie>> getMoviesByGenre(@PathVariable String genre) {
        return ResponseEntity.ok(movieService.getMoviesByGenre(genre));
    }

    /**
     * GET /api/movies/popular - Retrieve highest-rated / popular spotlight movies.
     */
    @GetMapping("/popular")
    public ResponseEntity<List<Movie>> getPopularMovies() {
        return ResponseEntity.ok(movieService.getPopularMovies());
    }

    /**
     * GET /api/movies/latest - Retrieve newest released movies.
     */
    @GetMapping("/latest")
    public ResponseEntity<List<Movie>> getLatestMovies() {
        return ResponseEntity.ok(movieService.getLatestMovies());
    }

    /**
     * GET /api/movies/trending - Retrieve trending movies.
     */
    @GetMapping("/trending")
    public ResponseEntity<List<Movie>> getTrendingMovies() {
        return ResponseEntity.ok(movieService.getTrendingMovies());
    }
}
