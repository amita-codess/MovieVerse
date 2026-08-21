package com.movieverse.service;

import com.movieverse.entity.Movie;
import com.movieverse.exception.ResourceNotFoundException;
import com.movieverse.repository.MovieRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * MovieService - Implements business logic for querying, searching, and filtering movies.
 */
@Service
public class MovieService {

    private final MovieRepository movieRepository;

    @Autowired
    public MovieService(MovieRepository movieRepository) {
        this.movieRepository = movieRepository;
    }

    public List<Movie> getAllMovies() {
        return movieRepository.findAll();
    }

    public Movie getMovieById(Long id) {
        return movieRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Movie not found with id: " + id));
    }

    public List<Movie> searchMovies(String query) {
        if (query == null || query.trim().isEmpty()) {
            return movieRepository.findAll();
        }
        return movieRepository.searchMovies(query.trim());
    }

    public List<Movie> getMoviesByGenre(String genre) {
        if (genre == null || genre.equalsIgnoreCase("All")) {
            return movieRepository.findAll();
        }
        return movieRepository.findByGenreContainingIgnoreCase(genre.trim());
    }

    public List<Movie> getPopularMovies() {
        return movieRepository.findByIsPopularTrueOrderByRatingDesc();
    }

    public List<Movie> getLatestMovies() {
        return movieRepository.findAllByOrderByReleaseDateDesc();
    }

    public List<Movie> getTrendingMovies() {
        return movieRepository.findByIsTrendingTrue();
    }

    public List<Movie> filterAndSortMovies(String title, String genre, String sort) {
        List<Movie> list;

        if (title != null && !title.trim().isEmpty()) {
            list = movieRepository.searchMovies(title.trim());
        } else if (genre != null && !genre.equalsIgnoreCase("All")) {
            list = movieRepository.findByGenreContainingIgnoreCase(genre.trim());
        } else {
            list = movieRepository.findAll();
        }

        // Apply in-memory sort if specified
        if ("rating".equalsIgnoreCase(sort)) {
            list.sort((a, b) -> Double.compare(b.getRating(), a.getRating()));
        } else if ("date".equalsIgnoreCase(sort) || "latest".equalsIgnoreCase(sort)) {
            list.sort((a, b) -> {
                if (a.getReleaseDate() == null || b.getReleaseDate() == null) return 0;
                return b.getReleaseDate().compareTo(a.getReleaseDate());
            });
        } else if ("title".equalsIgnoreCase(sort)) {
            list.sort((a, b) -> a.getTitle().compareToIgnoreCase(b.getTitle()));
        }

        return list;
    }
}
