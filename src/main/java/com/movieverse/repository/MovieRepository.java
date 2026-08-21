package com.movieverse.repository;

import com.movieverse.entity.Movie;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * MovieRepository - Spring Data JPA repository for Movie entity.
 */
@Repository
public interface MovieRepository extends JpaRepository<Movie, Long> {

    // Derived Query: Find by title containing substring (case-insensitive)
    List<Movie> findByTitleContainingIgnoreCase(String title);

    // Derived Query: Find by genre containing substring (case-insensitive)
    List<Movie> findByGenreContainingIgnoreCase(String genre);

    // Custom Query: Search across title, director, cast, or genre
    @Query("SELECT m FROM Movie m WHERE LOWER(m.title) LIKE LOWER(CONCAT('%', :q, '%')) " +
           "OR LOWER(m.director) LIKE LOWER(CONCAT('%', :q, '%')) " +
           "OR LOWER(m.cast) LIKE LOWER(CONCAT('%', :q, '%')) " +
           "OR LOWER(m.genre) LIKE LOWER(CONCAT('%', :q, '%'))")
    List<Movie> searchMovies(@Param("q") String query);

    // Popular movies: isPopular = true OR rating >= 8.2 ordered by rating descending
    List<Movie> findByIsPopularTrueOrderByRatingDesc();

    // Latest movies: order by releaseDate descending
    List<Movie> findAllByOrderByReleaseDateDesc();

    // Trending movies
    List<Movie> findByIsTrendingTrue();
}
