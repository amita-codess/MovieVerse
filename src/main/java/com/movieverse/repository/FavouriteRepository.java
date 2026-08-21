package com.movieverse.repository;

import com.movieverse.entity.Favourite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * FavouriteRepository - Spring Data JPA repository for Favourite entity.
 */
@Repository
public interface FavouriteRepository extends JpaRepository<Favourite, Long> {

    List<Favourite> findByUserId(Long userId);

    Optional<Favourite> findByUserIdAndMovieId(Long userId, Long movieId);

    Boolean existsByUserIdAndMovieId(Long userId, Long movieId);

    void deleteByUserIdAndMovieId(Long userId, Long movieId);
}
